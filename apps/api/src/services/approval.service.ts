// Approvals (task 4.4): list, approve (= execute), reject. The safety rules live here.
//
//  1. Only PENDING, NOT-EXPIRED actions can be decided.
//  2. Claiming is atomic: "UPDATE ... WHERE status = 'pending'" — if two people click at the
//     same time, exactly one wins; the other gets 409 already_decided.
//  3. The payload is validated again at approval time (the human may have edited it). Invalid
//     edits roll back the whole transaction: the action stays pending.
//  4. Approve and execute happen in ONE transaction, with an audit entry for each step. If the
//     execution itself fails, the action is marked "failed" (with the error) and audited.
//  5. Nothing is sent to customers: an approved reply is stored for the human agent to send.
import { traceLink } from '@sta/ai';
import {
  agentRuns,
  and,
  auditLog,
  desc,
  eq,
  getDb,
  proposedActions,
  sql,
  tickets,
  type ProposedAction,
  type Ticket,
} from '@sta/db';
import {
  ACTION_STATUSES,
  ActionPayloadSchemas,
  config,
  type ActionStatus,
  type ApprovalItem,
  type ApprovalsListResponse,
  type ApproveRequest,
  type DecisionResponse,
  type RejectRequest,
} from '@sta/shared';

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export class ApprovalError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const actor = (reviewer: string) => `user:${reviewer}`;

function toTicket(t: Ticket): ApprovalItem['ticket'] {
  return {
    id: t.id,
    externalId: t.externalId,
    subject: t.subject,
    product: t.product,
    description: t.description,
    category: t.category,
    priority: t.priority,
  };
}

/** Lazy expiry: pending actions past their deadline become "expired" (and are audited). */
export async function expireOverdue(): Promise<number> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const expired = await tx
      .update(proposedActions)
      .set({
        status: 'expired',
        decidedBy: 'system',
        decidedAt: new Date(),
        decisionNote: `not decided within ${config.agent.approvalTimeoutMinutes} minutes`,
      })
      .where(and(eq(proposedActions.status, 'pending'), sql`${proposedActions.expiresAt} < now()`))
      .returning({ id: proposedActions.id, ticketId: proposedActions.ticketId });
    if (expired.length) {
      await tx.insert(auditLog).values(
        expired.map((e) => ({
          actor: 'system',
          event: 'action.expired',
          entityType: 'proposed_action',
          entityId: e.id,
          ticketId: e.ticketId,
          details: { timeoutMinutes: config.agent.approvalTimeoutMinutes },
        })),
      );
    }
    return expired.length;
  });
}

async function loadItems(
  where: ReturnType<typeof eq> | undefined,
  limit: number,
): Promise<ApprovalItem[]> {
  const rows = await getDb()
    .select({ action: proposedActions, ticket: tickets, run: agentRuns })
    .from(proposedActions)
    .innerJoin(tickets, eq(tickets.id, proposedActions.ticketId))
    .innerJoin(agentRuns, eq(agentRuns.id, proposedActions.runId))
    .where(where)
    .orderBy(desc(proposedActions.createdAt))
    .limit(limit);

  return rows.map(({ action: a, ticket, run }) => {
    const suggestion = (
      run.result as { suggestion?: { summary?: string; confidence?: string } } | null
    )?.suggestion;
    return {
      id: a.id,
      type: a.type,
      status: a.status,
      payload: a.payload,
      rationale: a.rationale,
      createdAt: a.createdAt.toISOString(),
      expiresAt: a.expiresAt.toISOString(),
      decidedBy: a.decidedBy,
      decidedAt: a.decidedAt?.toISOString() ?? null,
      decisionNote: a.decisionNote,
      result: a.result ?? null,
      ticket: toTicket(ticket),
      run: {
        id: run.id,
        model: run.model,
        promptVersion: run.promptVersion,
        summary: suggestion?.summary ?? null,
        confidence: suggestion?.confidence ?? null,
        traceUrl: traceLink(run.traceId),
      },
    };
  });
}

export async function listApprovals(
  status: ActionStatus | 'all',
  limit = 100,
): Promise<ApprovalsListResponse> {
  await expireOverdue();
  const items = await loadItems(
    status === 'all' ? undefined : eq(proposedActions.status, status),
    limit,
  );

  const countRows = await getDb()
    .select({ status: proposedActions.status, n: sql<number>`count(*)::int` })
    .from(proposedActions)
    .groupBy(proposedActions.status);
  const counts = Object.fromEntries(ACTION_STATUSES.map((s) => [s, 0])) as Record<
    ActionStatus,
    number
  >;
  for (const r of countRows) counts[r.status] = r.n;

  return { items, counts };
}

/** Explain why an action can't be decided (it is not pending, missing, or expired). */
async function notDecidable(tx: Tx, id: string): Promise<ApprovalError> {
  const [row] = await tx.select().from(proposedActions).where(eq(proposedActions.id, id)).limit(1);
  if (!row) return new ApprovalError(404, 'not_found', `Proposed action ${id} not found`);
  if (row.status === 'pending') {
    return new ApprovalError(
      409,
      'expired',
      'This proposal expired. Re-run triage for a fresh one.',
    );
  }
  return new ApprovalError(
    409,
    'already_decided',
    `Already ${row.status}${row.decidedBy ? ` by ${row.decidedBy}` : ''}.`,
  );
}

/** Apply one approved action to the ticket. Returns what changed (stored in action.result). */
async function applyAction(
  tx: Tx,
  action: ProposedAction,
  payload: Record<string, unknown>,
  reviewer: string,
) {
  const [before] = await tx.select().from(tickets).where(eq(tickets.id, action.ticketId)).limit(1);
  if (!before) throw new Error('ticket no longer exists');
  const now = new Date();

  switch (action.type) {
    case 'set_category': {
      const p = ActionPayloadSchemas.set_category.parse(payload);
      await tx
        .update(tickets)
        .set({ category: p.category, updatedAt: now })
        .where(eq(tickets.id, before.id));
      return { field: 'category', before: before.category, after: p.category };
    }
    case 'set_priority': {
      const p = ActionPayloadSchemas.set_priority.parse(payload);
      await tx
        .update(tickets)
        .set({ priority: p.priority, updatedAt: now })
        .where(eq(tickets.id, before.id));
      return { field: 'priority', before: before.priority, after: p.priority };
    }
    case 'draft_reply': {
      // Not sent to the customer: the human agent sends it from the ticketing system.
      const p = ActionPayloadSchemas.draft_reply.parse(payload);
      const reply = {
        text: p.reply,
        citations: p.citations,
        approvedBy: actor(reviewer),
        approvedAt: now,
      };
      await tx
        .update(tickets)
        .set({
          metadata: sql`jsonb_set(${tickets.metadata}, '{approvedReply}', ${JSON.stringify(reply)}::jsonb)`,
          updatedAt: now,
        })
        .where(eq(tickets.id, before.id));
      return { field: 'metadata.approvedReply', sentToCustomer: false };
    }
    case 'add_internal_note': {
      const p = ActionPayloadSchemas.add_internal_note.parse(payload);
      const note = { text: p.note, by: actor(reviewer), at: now };
      await tx
        .update(tickets)
        .set({
          metadata: sql`jsonb_set(${tickets.metadata}, '{notes}', coalesce(${tickets.metadata}->'notes', '[]'::jsonb) || jsonb_build_array(${JSON.stringify(note)}::jsonb))`,
          updatedAt: now,
        })
        .where(eq(tickets.id, before.id));
      return { field: 'metadata.notes', added: 1 };
    }
    case 'escalate': {
      const p = ActionPayloadSchemas.escalate.parse(payload);
      const escalation = { team: p.team, by: actor(reviewer), at: now };
      await tx
        .update(tickets)
        .set({
          metadata: sql`jsonb_set(${tickets.metadata}, '{escalation}', ${JSON.stringify(escalation)}::jsonb)`,
          updatedAt: now,
        })
        .where(eq(tickets.id, before.id));
      return { field: 'metadata.escalation', team: p.team };
    }
  }
}

export async function approveAction(id: string, body: ApproveRequest): Promise<DecisionResponse> {
  const db = getDb();
  await db.transaction(async (tx) => {
    // 1. Atomic claim: only a pending, not-expired action; exactly one concurrent caller wins.
    const [claimed] = await tx
      .update(proposedActions)
      .set({
        status: 'approved',
        decidedBy: actor(body.reviewer),
        decidedAt: new Date(),
        decisionNote: body.note ?? null,
      })
      .where(
        and(
          eq(proposedActions.id, id),
          eq(proposedActions.status, 'pending'),
          sql`${proposedActions.expiresAt} > now()`,
        ),
      )
      .returning();
    if (!claimed) throw await notDecidable(tx, id);

    // 2. Re-validate the (possibly edited) payload. Throwing here rolls back the claim.
    const edited = body.payload !== undefined;
    const check = ActionPayloadSchemas[claimed.type].safeParse(body.payload ?? claimed.payload);
    if (!check.success) {
      const issues = check.error.issues.map(
        (i) => `${i.path.join('.') || 'payload'}: ${i.message}`,
      );
      throw new ApprovalError(
        400,
        'invalid_payload',
        `Invalid ${claimed.type} payload: ${issues.join('; ')}`,
      );
    }
    const payload = check.data as Record<string, unknown>;

    await tx.insert(auditLog).values({
      actor: actor(body.reviewer),
      event: 'action.approved',
      entityType: 'proposed_action',
      entityId: id,
      ticketId: claimed.ticketId,
      details: {
        type: claimed.type,
        edited,
        payload,
        ...(edited ? { originalPayload: claimed.payload } : {}),
        note: body.note ?? null,
      },
    });

    // 3. Execute inside a savepoint: if it fails, record "failed" instead of losing the decision.
    try {
      const result = await tx.transaction(async (sp) =>
        applyAction(sp, claimed, payload, body.reviewer),
      );
      await tx
        .update(proposedActions)
        .set({ status: 'executed', executedAt: new Date(), result, payload })
        .where(eq(proposedActions.id, id));
      await tx.insert(auditLog).values({
        actor: 'system',
        event: 'action.executed',
        entityType: 'proposed_action',
        entityId: id,
        ticketId: claimed.ticketId,
        details: { type: claimed.type, result },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await tx
        .update(proposedActions)
        .set({ status: 'failed', result: { error: message.slice(0, 500) } })
        .where(eq(proposedActions.id, id));
      await tx.insert(auditLog).values({
        actor: 'system',
        event: 'action.failed',
        entityType: 'proposed_action',
        entityId: id,
        ticketId: claimed.ticketId,
        details: { type: claimed.type, error: message.slice(0, 500) },
      });
    }
  });

  const [item] = await loadItems(eq(proposedActions.id, id), 1);
  if (!item) throw new ApprovalError(404, 'not_found', `Proposed action ${id} not found`);
  return { item, ticket: item.ticket };
}

export async function rejectAction(id: string, body: RejectRequest): Promise<DecisionResponse> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [rejected] = await tx
      .update(proposedActions)
      .set({
        status: 'rejected',
        decidedBy: actor(body.reviewer),
        decidedAt: new Date(),
        decisionNote: body.note ?? null,
      })
      .where(and(eq(proposedActions.id, id), eq(proposedActions.status, 'pending')))
      .returning();
    if (!rejected) throw await notDecidable(tx, id);
    await tx.insert(auditLog).values({
      actor: actor(body.reviewer),
      event: 'action.rejected',
      entityType: 'proposed_action',
      entityId: id,
      ticketId: rejected.ticketId,
      details: { type: rejected.type, note: body.note ?? null },
    });
  });
  const [item] = await loadItems(eq(proposedActions.id, id), 1);
  if (!item) throw new ApprovalError(404, 'not_found', `Proposed action ${id} not found`);
  return { item };
}
