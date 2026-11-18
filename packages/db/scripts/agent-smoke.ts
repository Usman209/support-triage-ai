// Smoke test for the agent data model (task 4.1). Runs in a transaction that is rolled back.
// Checks: inserts work, an action can be approved, the audit log rejects UPDATE and DELETE,
// deleting a ticket cascades to runs/actions but the audit entry survives.
// Usage: pnpm db:agent-smoke
import { config } from '@sta/shared';
import {
  agentRuns,
  auditLog,
  closeDb,
  eq,
  getDb,
  proposedActions,
  sql,
  tickets,
} from '../src/index';

class Rollback extends Error {}
type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

const results: { check: string; ok: boolean; detail: string }[] = [];
const record = (check: string, ok: boolean, detail = '') => results.push({ check, ok, detail });

/** Run `fn` in a SAVEPOINT; return the database error message if it fails. */
async function expectFailure(tx: Tx, fn: (sp: Tx) => Promise<unknown>): Promise<string | null> {
  try {
    await tx.transaction(async (sp) => {
      await fn(sp);
    });
    return null;
  } catch (error) {
    const e = error as { cause?: { message?: string }; message?: string };
    return e.cause?.message ?? e.message ?? String(error);
  }
}

async function main() {
  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      // 1. Create a ticket, a run, a pending action, an audit entry.
      const [ticket] = await tx
        .insert(tickets)
        .values({
          externalId: 'SMOKE-1',
          subject: 'Charged twice',
          description: 'I was charged twice for my order.',
          product: 'GoPro Hero',
          channel: 'Email',
        })
        .returning();
      if (!ticket) throw new Error('ticket insert failed');

      const [run] = await tx
        .insert(agentRuns)
        .values({ ticketId: ticket.id, model: 'test-model', promptVersion: 'test' })
        .returning();
      if (!run) throw new Error('run insert failed');

      const expiresAt = new Date(Date.now() + config.agent.approvalTimeoutMinutes * 60_000);
      const [action] = await tx
        .insert(proposedActions)
        .values({
          runId: run.id,
          ticketId: ticket.id,
          type: 'set_priority',
          payload: { priority: 'high' },
          rationale: 'Customer was charged twice; money issue.',
          expiresAt,
        })
        .returning();
      if (!action) throw new Error('action insert failed');

      const [audit] = await tx
        .insert(auditLog)
        .values({
          actor: 'agent',
          event: 'action.proposed',
          entityType: 'proposed_action',
          entityId: action.id,
          ticketId: ticket.id,
          details: { type: action.type, payload: action.payload },
        })
        .returning();
      if (!audit) throw new Error('audit insert failed');
      record(
        'insert ticket, run, action (pending), audit entry',
        action.status === 'pending',
        `expires in ${config.agent.approvalTimeoutMinutes} min`,
      );

      // 2. A human approves the action.
      const [approved] = await tx
        .update(proposedActions)
        .set({ status: 'approved', decidedBy: 'user:smoke-test', decidedAt: new Date() })
        .where(eq(proposedActions.id, action.id))
        .returning();
      record('approve action (pending -> approved)', approved?.status === 'approved');

      // 3 + 4. The audit log must refuse UPDATE and DELETE.
      const updateError = await expectFailure(tx, (sp) =>
        sp.update(auditLog).set({ event: 'tampered' }).where(eq(auditLog.id, audit.id)),
      );
      record('audit UPDATE is blocked', updateError !== null, updateError ?? 'update was ALLOWED');
      const deleteError = await expectFailure(tx, (sp) =>
        sp.delete(auditLog).where(eq(auditLog.id, audit.id)),
      );
      record('audit DELETE is blocked', deleteError !== null, deleteError ?? 'delete was ALLOWED');

      // 5. Deleting the ticket cascades to runs/actions; the audit entry stays.
      await tx.delete(tickets).where(eq(tickets.id, ticket.id));
      const [counts] = await tx.execute<{ runs: number; actions: number; audit: number }>(sql`
        select (select count(*)::int from agent_runs where id = ${run.id}) as runs,
               (select count(*)::int from proposed_actions where id = ${action.id}) as actions,
               (select count(*)::int from audit_log where id = ${audit.id}) as audit`);
      record(
        'delete ticket: runs/actions cascade, audit survives',
        counts?.runs === 0 && counts?.actions === 0 && counts?.audit === 1,
        JSON.stringify(counts),
      );

      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }

  console.table(results);
  const failed = results.filter((r) => !r.ok).length;
  console.log(
    failed ? `${failed} check(s) FAILED` : 'all checks passed · rolled back, no data kept',
  );
  if (failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
