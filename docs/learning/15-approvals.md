# Step 15 (Tasks 4.4 + 4.5): Approvals API and Approvals page

## 1. Goal

Close the loop: a human reviews what the triage agent proposed and **approves, edits or rejects**
it. Approving executes the action on the ticket, safely, and everything is audited.

## 2. What we built

| File                                                                                    | What                                                                                  |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/shared/src/schemas/approvals.ts`                                              | Payload schema per action type, approve/reject request schemas, list types            |
| `packages/shared/src/client.ts` + `package.json` exports                                | **`@sta/shared/client`**: browser-safe entry (no `config`, no secrets)                |
| `apps/api/src/services/approval.service.ts`                                             | The rules: lazy expiry, atomic claim, re-validation, execute, audit                   |
| `apps/api/src/routes/approvals.ts`                                                      | `GET /approvals?status=`, `POST /approvals/:id/approve`, `POST /approvals/:id/reject` |
| `apps/web/src/lib/api-proxy.ts` + `app/api/approvals/…`, `app/api/tickets/[ref]/triage` | Server-side proxy routes for the page                                                 |
| `apps/web/src/components/approvals/approvals-panel.tsx`                                 | The page: triage box, status tabs with counts, ticket cards, Approve / Edit / Reject  |
| `apps/web/src/app/approvals/page.tsx`, `globals.css`                                    | Page + styles                                                                         |

Open **http://localhost:3010/approvals**.

## 3. The safety rules (and why)

| Rule                                             | How                                                               | Why                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Only **pending** actions can be decided          | `UPDATE … WHERE status = 'pending'`                               | Decisions are final; no re-approving                                               |
| **Atomic claim**                                 | The same conditional UPDATE: exactly one caller gets the row      | Two reviewers clicking at once must not both execute                               |
| **Expiry** (30 min)                              | Claim requires `expires_at > now()`; list runs lazy expiry        | Don't apply decisions based on stale suggestions                                   |
| **Re-validate at approval**                      | Zod schema per action type on the (possibly edited) payload       | The human can edit; the agent's payload could be wrong; trust nothing              |
| Invalid edit **rolls back**                      | Error inside the transaction                                      | A bad edit must not consume the approval                                           |
| **Approve + execute + audit in one transaction** | DB transaction; execution in a savepoint                          | All-or-nothing; if execution fails, record `failed` instead of losing the decision |
| **Edits are audited with the original**          | `action.approved` details: `edited`, `payload`, `originalPayload` | Shows what the human changed (also great eval data)                                |
| **Nothing reaches the customer**                 | Approved reply stored in `tickets.metadata.approvedReply`         | The human agent sends it from the ticketing system                                 |
| **Reviewer recorded**                            | `decided_by = user:<name>`                                        | Accountability (real login in task 8)                                              |

Where approved actions go (no external ticketing system yet):

| Action                         | Effect                                                     |
| ------------------------------ | ---------------------------------------------------------- |
| `set_category`, `set_priority` | Ticket columns (result stores before → after)              |
| `draft_reply`                  | `tickets.metadata.approvedReply` (`sentToCustomer: false`) |
| `add_internal_note`            | Appended to `tickets.metadata.notes`                       |
| `escalate`                     | `tickets.metadata.escalation`                              |

## 4. How it works

```
Approvals page (browser)
  GET /api/approvals?status=pending  -> Next.js proxy -> API
     expireOverdue()  (pending + expires_at < now -> expired, audited)
     list actions + ticket + run (summary, confidence, trace link) + counts per status
  click Approve / Edit / Reject
  POST /api/approvals/:id/approve {reviewer, note?, payload?}
     transaction:
       claim pending+not expired  (else 404 / 409 expired / 409 already_decided)
       validate payload (else 400, claim rolled back)
       audit action.approved
       savepoint: apply to ticket -> executed + result + audit action.executed
                  on error        -> failed + error   + audit action.failed
  page refreshes; ticket card shows "now: category …, priority …"
```

## 5. Tested (through the real API)

| Check                                        | Result                                   |
| -------------------------------------------- | ---------------------------------------- |
| Triage creates pending proposals             | ✅ 4 proposals                           |
| Approve → executed, ticket changed           | ✅ priority set                          |
| Approve twice                                | ✅ `409 Already executed by user:tester` |
| Edit with invalid value (`free_pizza`)       | ✅ `400`, stays pending                  |
| Edit with valid value                        | ✅ executed with the edited category     |
| **Alice and Bob approve at the same moment** | ✅ `200 + 409`, one winner               |
| Reject                                       | ✅ rejected                              |
| Ticket changed only by approved actions      | ✅                                       |
| Approve an expired proposal                  | ✅ `409 expired`                         |
| Through the web proxy (what the buttons use) | ✅ SAMPLE-005 priority null → medium     |

## 6. Try it yourself

1. Open http://localhost:3010/approvals (set "Reviewing as" to your name).
2. Type `SAMPLE-007` in **Triage a ticket** → Run triage → new pending proposals appear.
3. **Approve** "Set priority" → the card header shows the new priority.
4. **Edit** the reply draft (change a sentence) → "Approve edited".
5. **Reject** the internal note with a reason.
6. Open the **Executed** and **Rejected** tabs. Then in SQL:
   `select occurred_at, actor, event, details from audit_log order by id desc limit 10;`
   You'll see `action.approved` with `"edited": true` and the `originalPayload`.
7. Try approving the same item in two browser tabs: the second gets "Already executed".

## 7. Problems we faced

| Problem                                                                                    | Cause                                  | Fix                                                           | Lesson                                                     |
| ------------------------------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| Triage PR not in `main` again                                                              | Not merged yet                         | Built on `feat/triage-agent` + merged latest `main`           | Check `origin/main` before branching                       |
| Browser code needs schema constants, but `@sta/shared` includes `config.ts` (reads `.env`) | One entry point for server and browser | `@sta/shared/client` entry with schemas only                  | Separate server-only and browser-safe modules              |
| Race: two approvals at once                                                                | Read-then-write would let both pass    | Conditional `UPDATE … WHERE status='pending'` (atomic claim)  | Let the database decide races                              |
| Invalid edit shouldn't use up the approval                                                 | Claim happens first                    | Validation error inside the transaction → rollback            | Order operations so failures leave a clean state           |
| No ticketing system to "execute" into                                                      | Integration is a later task            | Store results on the ticket (columns/metadata); adapter later | Keep the executor behind one function so it can be swapped |
| Same ticket triaged twice can give different priorities (SAMPLE-004: high, later medium)   | LLM output is non-deterministic        | Human approval; evals must run several times                  | Measure variance, don't trust one run                      |

## 8. Interview questions

**Q: How do you implement human-in-the-loop for agent actions?**
Agent writes proposals (type, payload, rationale, expiry); humans approve/edit/reject; approval
re-validates and executes in one transaction; every step is audited; expired or decided proposals
can't be executed.

**Q: How do you prevent two people approving the same action?**
An atomic conditional update (`WHERE status = 'pending'`) so only one transaction succeeds; the
other gets a conflict (409). Optimistic concurrency, no locks held across user think-time.

**Q: Why re-validate the payload when approving?**
The human may edit it, and the original came from an LLM. Validation at the point of execution is
the last line of defence.

**Q: Why record edits with the original payload?**
Accountability, and it's valuable data: edits show where the agent is wrong (future evals and
prompt improvements).

**Q: How do you share types between server and browser safely?**
A browser-safe entry point that exports only schemas/types; server config and secrets live in a
separate module the client never imports.

## 9. Key takeaways

- The agent proposes; the human decides; the database enforces.
- Atomic claims, re-validation and one transaction make approvals safe.
- Every decision, edit and failure is in the append-only audit log.
