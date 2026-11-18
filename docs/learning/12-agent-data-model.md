# Step 12 (Task 4.1): Agent data model (tickets, runs, approvals, audit log)

## 1. Goal

Store everything the approval-gated agent needs **before** writing the agent: tickets, each agent
run, every action it proposes (the approval queue), and a tamper-proof audit log.

## 2. What we built

| File                                                            | What                                                                                                     |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/db/src/schema/tickets.ts`                             | `tickets` + enums `ticket_category`, `ticket_priority`, `ticket_status`                                  |
| `packages/db/src/schema/approvals.ts`                           | `agent_runs`, `proposed_actions`, `audit_log` + enums `agent_run_status`, `action_type`, `action_status` |
| `packages/db/migrations/0003_agent_tickets_approvals_audit.sql` | Generated: 6 enums, 4 tables, indexes, foreign keys                                                      |
| `packages/db/migrations/0004_audit_log_append_only.sql`         | Hand-written: triggers that block UPDATE, DELETE, TRUNCATE on `audit_log`                                |
| `packages/db/scripts/agent-smoke.ts`                            | `pnpm db:agent-smoke`: proves the rules, then rolls back                                                 |
| `packages/db/scripts/smoke.ts`                                  | Fixed: count only the test document's chunks                                                             |

```
tickets 1──* agent_runs 1──* proposed_actions          audit_log (append-only)
   │                              │                      actor · event · entity
   └──────────────* ──────────────┘                      ticket_id (no FK!)
```

## 3. Why this way

- **Proposals are data, not actions.** The agent never changes a ticket. It inserts rows into
  `proposed_actions` with status `pending`. Only an approved action is executed (step 4.4). This is
  "human in the loop" built into the data model.
- **Allowed action types are an enum**: `set_category`, `set_priority`, `draft_reply`,
  `add_internal_note`, `escalate`. "Send to customer", "close", "refund" are **not in the list**,
  so the agent can't even propose them (discovery brief rules).
- **Status lifecycle** `pending → approved → executed | failed`, `pending → rejected | expired`:
  every action has a clear state; `expires_at` (`APPROVAL_TIMEOUT_MINUTES=30`) so old proposals
  don't get approved on stale information.
- **`rationale` column**: the approver sees _why_ the agent proposes something.
- **`agent_runs` keeps the full suggestion, model, prompt version and `trace_id`**: every proposal
  can be traced back to the exact run and Langfuse trace.
- **Append-only audit log, enforced by the database**: a trigger raises an error on UPDATE,
  DELETE and TRUNCATE. Even a bug or a stolen app credential can't rewrite history. An editable
  audit log is not evidence.
- **`audit_log.ticket_id` has no foreign key**: audit records must survive when a ticket is
  deleted (cascade would erase the history).
- **`bigserial` id for audit**: strictly increasing numbers show the exact order of events.
- **Enums in Postgres**: invalid values are rejected by the database, and TypeScript gets the
  exact union types.
- **Indexes for real queries**: the approval queue ("pending, oldest first"), "everything for
  this ticket" (audit and actions).
- **No PII columns in `tickets`**: no name, email, age, gender. We don't need them to triage, so
  we don't store them (data minimisation).

## 4. How it works

```
agent run (4.3)       insert agent_runs(running) -> insert proposed_actions(pending)
                      -> insert audit_log(action.proposed) -> agent_runs(completed)
human (4.4/4.5)       pending -> approved (decided_by, decided_at) -> audit_log(action.approved)
execution (4.4)       approved -> executed (ticket updated) -> audit_log(action.executed)
                      or failed (result.error) -> audit_log(action.failed)
nobody                UPDATE/DELETE audit_log -> ERROR "audit_log is append-only"
```

Smoke test result:

| Check                                               | Result                                               |
| --------------------------------------------------- | ---------------------------------------------------- |
| Insert ticket, run, pending action, audit entry     | ✅ (expires in 30 min)                               |
| Approve action (pending → approved)                 | ✅                                                   |
| Audit UPDATE blocked                                | ✅ `audit_log is append-only: UPDATE is not allowed` |
| Audit DELETE blocked                                | ✅ `audit_log is append-only: DELETE is not allowed` |
| Delete ticket: runs/actions cascade, audit survives | ✅ `{"runs":0,"actions":0,"audit":1}`                |

## 5. Try it yourself

```bash
pnpm db:agent-smoke     # all checks, rolled back
pnpm db:smoke           # RAG tables still fine
```

In pgAdmin/DBeaver (database `support`), try it by hand:

```sql
insert into audit_log (actor, event, entity_type, entity_id) values ('me', 'test', 'demo', '1');
update audit_log set event = 'changed';   -- ERROR: audit_log is append-only
delete from audit_log;                    -- ERROR: audit_log is append-only
```

(The test row stays, by design. That is the point of an append-only log.)

## 6. Problems we faced

| Problem                                                   | Cause                                                 | Fix                                                             | Lesson                                                           |
| --------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| Docs PR not merged when Task 4 started                    | `origin/main` still at PR #6                          | Started this branch from the docs branch, so both merge cleanly | Check `origin/main` before branching                             |
| Drizzle can't express "append-only"                       | ORMs model tables, not triggers                       | Hand-written migration 0004 with triggers                       | Security rules belong in the database when they must always hold |
| Cascade would delete audit history                        | Foreign key with `onDelete: cascade`                  | No FK on `audit_log.ticket_id`                                  | Audit data must outlive the data it describes                    |
| Testing a failing statement aborted the whole transaction | In Postgres, an error aborts the transaction          | Nested transaction = SAVEPOINT for each expected failure        | Use savepoints to test errors inside one transaction             |
| `db:smoke` said "74 chunks left after cascade"            | Test counted all chunks; ingestion added 74 real ones | Count only the test document's chunks                           | Tests must not depend on other data in the database              |

## 7. Interview questions

**Q: How do you make an AI agent safe to run on real systems?**
Separate _proposing_ from _doing_: the agent writes proposals with a rationale; a human approves;
only approved, validated actions execute; everything is audited; dangerous actions are not in the
allowed list at all.

**Q: How do you make an audit log tamper-proof?**
Append-only at the database level (triggers or permissions that forbid UPDATE/DELETE), no cascade
deletes, ordered ids and timestamps, restricted access; for stronger guarantees, ship entries to
write-once storage or hash-chain them.

**Q: Why store proposals in a table instead of executing tool calls directly?**
Approval can happen minutes later by another person; the proposal must survive restarts, be
listed, expire, and leave history. A table gives state, queries and audit.

**Q: Why enums for action types and statuses?**
The database rejects invalid values, the allowed set is visible in one place, and TypeScript gets
exact types.

**Q: Why expire proposals?**
A ticket can change after the agent looked at it. Approving an old proposal could apply a decision
based on stale information.

## 8. Key takeaways

- Model "propose → approve → execute" in data before building the agent.
- Put must-always-hold rules (append-only) in the database.
- Don't store personal data you don't need.
