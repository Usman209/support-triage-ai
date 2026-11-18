// Triage agent (task 4.3): ticket -> help-centre sources -> structured suggestion -> PENDING proposals.
//
// Design: a fixed workflow, not a free tool-calling loop. The steps are always the same, so the
// LLM decides the VALUES (category, priority, reply) and the code decides the FLOW. Code also
// decides which actions exist: the model can't invent new action types.
//
//   1. load ticket                 4. LLM -> JSON -> Zod (one repair attempt)
//   2. agent_runs row (running)    5. guards (no reply without sources, escalation consistency)
//   3. retrieve sources            6. one transaction: supersede old pending proposals, insert new
//                                     ones (pending), audit every step, run -> completed
// Nothing is executed here. A human approves in task 4.4.
import { propagateAttributes, startActiveObservation } from '@langfuse/tracing';
import {
  config,
  TriageSuggestionSchema,
  type TriageProposal,
  type TriageRunResult,
  type TriageSuggestion,
} from '@sta/shared';
import {
  agentRuns,
  and,
  auditLog,
  eq,
  getDb,
  proposedActions,
  tickets,
  type NewAuditEntry,
  type NewProposedAction,
  type Ticket,
} from '@sta/db';
import { getChatProvider } from '../providers';
import type { ChatMessage } from '../providers/types';
import {
  TRIAGE_PROMPT_VERSION,
  TRIAGE_SYSTEM_PROMPT,
  buildRepairMessage,
  buildTriageUserMessage,
} from '../prompts/triage.prompt';
import { citedIds, normaliseCitations } from '../rag/citations';
import { rerank } from '../rag/reranker';
import { retrieve } from '../rag/retriever';
import { realTraceId, traceLink } from '../tracing';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class TicketNotFoundError extends Error {}

/** The text we search the help centre with: subject + description (bounded length). */
export function triageQuery(ticket: Pick<Ticket, 'subject' | 'description'>): string {
  return `${ticket.subject}. ${ticket.description}`.slice(0, 1000);
}

async function loadTicket(ref: string): Promise<Ticket> {
  const db = getDb();
  const where = UUID.test(ref) ? eq(tickets.id, ref) : eq(tickets.externalId, ref);
  const [ticket] = await db.select().from(tickets).where(where).limit(1);
  if (!ticket) throw new TicketNotFoundError(`Ticket "${ref}" not found`);
  return ticket;
}

/** JSON.parse that tolerates code fences the model may add despite instructions. */
function parseJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

function issuesText(error: unknown): string {
  const zodIssues = (error as { issues?: { path: PropertyKey[]; message: string }[] }).issues;
  if (zodIssues)
    return zodIssues.map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
  return `- ${error instanceof Error ? error.message : String(error)}`;
}

/** Ask the model; validate; on failure, show it the problems once and ask for corrected JSON. */
async function suggest(userMessage: string) {
  const chat = getChatProvider();
  const messages: ChatMessage[] = [{ role: 'user', content: userMessage }];
  let inputTokens = 0;
  let outputTokens = 0;
  let generationMs = 0;
  let model = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await chat.chat({
      tier: 'chat',
      system: TRIAGE_SYSTEM_PROMPT,
      messages,
      responseFormat: 'json',
    });
    inputTokens += result.usage.inputTokens;
    outputTokens += result.usage.outputTokens;
    generationMs += result.latencyMs;
    model = result.model;
    try {
      const suggestion = TriageSuggestionSchema.parse(parseJson(result.text));
      return { suggestion, repaired: attempt > 0, model, inputTokens, outputTokens, generationMs };
    } catch (error) {
      if (attempt === 1) {
        throw new Error(`Triage output invalid after repair attempt:\n${issuesText(error)}`);
      }
      // Self-repair: give the model its own output and the exact validation errors.
      messages.push({ role: 'assistant', content: result.text });
      messages.push({ role: 'user', content: buildRepairMessage(issuesText(error)) });
    }
  }
  throw new Error('unreachable');
}

/** Code-side guards: the model's suggestion must be consistent before it becomes proposals. */
function applyGuards(s: TriageSuggestion, sourceCount: number): TriageSuggestion {
  const out = { ...s };
  if (!out.escalate) {
    out.escalationTeam = null;
    out.escalationReason = null;
  }
  if (out.escalate && !out.escalationTeam) out.escalate = false; // can't escalate to nobody
  if (out.replyDraft) {
    out.replyDraft = normaliseCitations(out.replyDraft);
    // A reply without any valid source citation is not grounded: don't propose it.
    if (sourceCount === 0 || citedIds(out.replyDraft, sourceCount).length === 0)
      out.replyDraft = null;
  }
  return out;
}

export function triageTicket(ref: string): Promise<TriageRunResult> {
  return propagateAttributes({ traceName: 'triage', tags: ['triage', TRIAGE_PROMPT_VERSION] }, () =>
    startActiveObservation(
      'triage-ticket',
      async (observation): Promise<TriageRunResult> => {
        const started = Date.now();
        const db = getDb();
        const traceId = realTraceId(observation.traceId);

        // 1. Load the ticket.
        const ticket = await loadTicket(ref);
        observation.update({
          input: { ticket: ticket.externalId, subject: ticket.subject, product: ticket.product },
        });

        // 2. Record the run before doing anything expensive.
        const [run] = await db
          .insert(agentRuns)
          .values({ ticketId: ticket.id, promptVersion: TRIAGE_PROMPT_VERSION, traceId })
          .returning();
        if (!run) throw new Error('could not create agent run');

        try {
          // 3. Find help-centre sources for this ticket.
          const retrieval = await retrieve(triageQuery(ticket));
          const relevant = retrieval.chunks.filter((c) => c.distance <= config.rag.maxDistance);
          const sources = rerank(relevant).map((c, i) => ({
            id: i + 1,
            title: c.title,
            section: c.section,
            source: c.source,
            content: c.content,
            distance: Number(c.distance.toFixed(3)),
          }));

          // 4. Structured suggestion from the LLM (validated, one repair attempt).
          const gen = await suggest(buildTriageUserMessage(ticket, sources));

          // 5. Guards.
          const suggestion = applyGuards(gen.suggestion, sources.length);

          // 6. Turn the suggestion into proposals (code decides which actions exist).
          const expiresAt = new Date(Date.now() + config.agent.approvalTimeoutMinutes * 60_000);
          const base = { runId: run.id, ticketId: ticket.id, expiresAt };
          const drafts: NewProposedAction[] = [
            {
              ...base,
              type: 'set_category',
              payload: { category: suggestion.category },
              rationale: suggestion.categoryReason,
            },
            {
              ...base,
              type: 'set_priority',
              payload: { priority: suggestion.priority },
              rationale: suggestion.priorityReason,
            },
          ];
          if (suggestion.replyDraft) {
            const ids = citedIds(suggestion.replyDraft, sources.length);
            drafts.push({
              ...base,
              type: 'draft_reply',
              payload: {
                reply: suggestion.replyDraft,
                citations: sources
                  .filter((s) => ids.includes(s.id))
                  .map(({ id, title, section, source }) => ({ id, title, section, source })),
              },
              rationale: `Reply grounded in ${ids.length} help-centre source(s).`,
            });
          }
          if (suggestion.escalate && suggestion.escalationTeam) {
            drafts.push({
              ...base,
              type: 'escalate',
              payload: { team: suggestion.escalationTeam },
              rationale: suggestion.escalationReason ?? 'Escalation suggested by the agent.',
            });
          }
          if (suggestion.internalNote) {
            drafts.push({
              ...base,
              type: 'add_internal_note',
              payload: { note: suggestion.internalNote },
              rationale: 'Note for colleagues suggested by the agent.',
            });
          }

          // 7. One transaction: supersede old pending proposals, insert new ones, audit, finish run.
          const usage = {
            inputTokens: gen.inputTokens,
            outputTokens: gen.outputTokens,
            embeddingTokens: retrieval.embeddingTokens,
          };
          const { inserted, superseded } = await db.transaction(async (tx) => {
            const old = await tx
              .update(proposedActions)
              .set({
                status: 'expired',
                decidedBy: 'system',
                decidedAt: new Date(),
                decisionNote: `superseded by run ${run.id}`,
              })
              .where(
                and(eq(proposedActions.ticketId, ticket.id), eq(proposedActions.status, 'pending')),
              )
              .returning({ id: proposedActions.id });

            const rows = await tx.insert(proposedActions).values(drafts).returning();

            const audit: NewAuditEntry[] = [
              ...old.map((o) => ({
                actor: 'system',
                event: 'action.superseded',
                entityType: 'proposed_action',
                entityId: o.id,
                ticketId: ticket.id,
                details: { byRun: run.id },
                traceId,
              })),
              ...rows.map((r) => ({
                actor: 'agent',
                event: 'action.proposed',
                entityType: 'proposed_action',
                entityId: r.id,
                ticketId: ticket.id,
                details: {
                  type: r.type,
                  payload: r.payload,
                  rationale: r.rationale,
                  runId: run.id,
                },
                traceId,
              })),
              {
                actor: 'agent',
                event: 'run.completed',
                entityType: 'agent_run',
                entityId: run.id,
                ticketId: ticket.id,
                details: {
                  proposals: rows.length,
                  confidence: suggestion.confidence,
                  model: gen.model,
                },
                traceId,
              },
            ];
            await tx.insert(auditLog).values(audit);

            await tx
              .update(agentRuns)
              .set({
                status: 'completed',
                model: gen.model,
                result: {
                  suggestion,
                  // Store source references, not the full chunk text (it's already in `chunks`).
                  sources: sources.map(({ id, title, section, source, distance }) => ({
                    id,
                    title,
                    section,
                    source,
                    distance,
                  })),
                  repaired: gen.repaired,
                },
                usage,
                finishedAt: new Date(),
              })
              .where(eq(agentRuns.id, run.id));

            return { inserted: rows, superseded: old.length };
          });

          const proposals: TriageProposal[] = inserted.map((r) => ({
            id: r.id,
            type: r.type,
            payload: r.payload,
            rationale: r.rationale,
            status: r.status,
            expiresAt: r.expiresAt.toISOString(),
          }));

          observation.update({
            output: {
              category: suggestion.category,
              priority: suggestion.priority,
              proposals: proposals.map((p) => p.type),
              confidence: suggestion.confidence,
            },
            metadata: {
              runId: run.id,
              repaired: gen.repaired,
              superseded,
              sources: sources.length,
            },
          });

          return {
            runId: run.id,
            ticketId: ticket.id,
            externalId: ticket.externalId,
            suggestion,
            proposals,
            sources: sources.map(({ id, title, section, distance }) => ({
              id,
              title,
              section,
              distance,
            })),
            supersededProposals: superseded,
            model: gen.model,
            promptVersion: TRIAGE_PROMPT_VERSION,
            repaired: gen.repaired,
            usage,
            timings: {
              retrievalMs: retrieval.latencyMs,
              generationMs: gen.generationMs,
              totalMs: Date.now() - started,
            },
            traceId,
            traceUrl: traceLink(traceId),
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await db
            .update(agentRuns)
            .set({ status: 'failed', error: message.slice(0, 2000), finishedAt: new Date() })
            .where(eq(agentRuns.id, run.id));
          await db.insert(auditLog).values({
            actor: 'agent',
            event: 'run.failed',
            entityType: 'agent_run',
            entityId: run.id,
            ticketId: ticket.id,
            details: { error: message.slice(0, 500) },
            traceId,
          });
          observation.update({ level: 'ERROR', statusMessage: message });
          throw error;
        }
      },
      { asType: 'agent' },
    ),
  );
}
