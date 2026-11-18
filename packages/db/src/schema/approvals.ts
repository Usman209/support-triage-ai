// Agent runs, proposed actions (the approval queue) and the audit log (task 4).
//
//   agent_runs        one triage run of the agent on one ticket
//   proposed_actions  what the agent WANTS to do; nothing happens until a human approves
//   audit_log         append-only record of every agent proposal and human decision
import {
  bigserial,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { tickets } from './tickets';

export const runStatus = pgEnum('agent_run_status', ['running', 'completed', 'failed']);

/** Actions the agent may PROPOSE. Sending to customers, closing, refunds: never (not in this list). */
export const actionType = pgEnum('action_type', [
  'set_category',
  'set_priority',
  'draft_reply',
  'add_internal_note',
  'escalate',
]);

/**
 * Lifecycle: pending -> approved -> executed | failed
 *            pending -> rejected
 *            pending -> expired (after APPROVAL_TIMEOUT_MINUTES)
 */
export const actionStatus = pgEnum('action_status', [
  'pending',
  'approved',
  'rejected',
  'expired',
  'executed',
  'failed',
]);

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    status: runStatus('status').notNull().default('running'),
    model: text('model'),
    promptVersion: text('prompt_version'),
    /** Langfuse trace of this run. */
    traceId: text('trace_id'),
    /** The agent's suggestion: category, priority, reply draft, reasoning summary, sources. */
    result: jsonb('result').$type<Record<string, unknown>>(),
    usage: jsonb('usage').$type<Record<string, number>>(),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('agent_runs_ticket_idx').on(t.ticketId)],
);

export const proposedActions = pgTable(
  'proposed_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    runId: uuid('run_id')
      .notNull()
      .references(() => agentRuns.id, { onDelete: 'cascade' }),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    type: actionType('type').notNull(),
    /** Action input, e.g. { "priority": "high" } or { "reply": "..." }. Validated before execution. */
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    /** Why the agent proposes it (shown to the approver). */
    rationale: text('rationale').notNull(),
    status: actionStatus('status').notNull().default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    /** What execution did (or the error). */
    result: jsonb('result').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The approval queue query: "pending actions, oldest first".
    index('proposed_actions_status_idx').on(t.status, t.createdAt),
    index('proposed_actions_ticket_idx').on(t.ticketId),
  ],
);

export const auditLog = pgTable(
  'audit_log',
  {
    // bigserial: strictly increasing, shows the exact order of events.
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    /** Who did it: "agent", "user:<id>" or "system". */
    actor: text('actor').notNull(),
    /** What happened, e.g. "action.proposed", "action.approved", "action.executed". */
    event: text('event').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    /**
     * Plain column, NO foreign key: audit records must survive even if the ticket is deleted.
     */
    ticketId: uuid('ticket_id'),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    traceId: text('trace_id'),
  },
  (t) => [
    index('audit_log_ticket_idx').on(t.ticketId, t.occurredAt),
    index('audit_log_entity_idx').on(t.entityType, t.entityId),
  ],
);

export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;
export type ProposedAction = typeof proposedActions.$inferSelect;
export type NewProposedAction = typeof proposedActions.$inferInsert;
export type AuditEntry = typeof auditLog.$inferSelect;
export type NewAuditEntry = typeof auditLog.$inferInsert;
