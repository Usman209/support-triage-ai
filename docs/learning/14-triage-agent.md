# Step 14 (Task 4.3): Triage agent (proposes, never acts)

## 1. Goal

For one ticket: find help-centre sources, decide category and priority with reasons, draft a
grounded reply, suggest escalation/notes, and save everything as **pending** proposals that a
human must approve (step 4.4).

## 2. What we built

| File                                                 | What                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `packages/shared/src/schemas/triage.ts`              | `TriageSuggestionSchema` (Zod): the exact JSON the LLM must return                                |
| `packages/ai/src/prompts/triage.prompt.ts`           | Prompt **`triage-v2`**: definitions, priority rubric, ticket = untrusted data                     |
| `packages/ai/src/agents/triage.agent.ts`             | `triageTicket(ref)`: the pipeline (run, retrieve, LLM, validate, guards, proposals, audit, trace) |
| `packages/ai/src/rag/citations.ts`, `src/tracing.ts` | Shared helpers (citation clean-up, trace links)                                                   |
| `packages/ai/src/rag/retriever.ts`                   | `warmQueryCache()`: embed many queries in one call                                                |
| `packages/ai/src/providers/*`                        | `responseFormat: 'json'` (Groq JSON mode)                                                         |
| `apps/api/src/routes/tickets.ts`                     | `GET /tickets/:ref`, `POST /tickets/:ref/triage` (feature flag)                                   |
| `packages/ai/scripts/triage.ts`, `triage-check.ts`   | `pnpm triage SAMPLE-003`, `pnpm triage:check`                                                     |
| `.env`                                               | `FEATURE_AGENT_ENABLED=true` locally (template stays `false`)                                     |

## 3. Why this way

- **Workflow, not a free agent loop.** Triage always has the same steps. A fixed pipeline where
  the LLM decides the _values_ and the code decides the _flow_ is cheaper, faster, more
  predictable and easier to evaluate. A tool-calling loop is worth it when the steps are not known
  in advance. (Interview favourite: "agent vs workflow".)
- **Structured output + Zod validation**: JSON mode guarantees JSON, not the right fields. Zod
  checks every field and enum value. If it fails, **one self-repair attempt**: the model gets its
  own output plus the exact errors.
- **Code turns suggestions into proposals**: only 5 action types exist (enum). The model cannot
  invent "send_email" or "refund".
- **Guards after the model**: no reply without at least one valid source citation (no ungrounded
  replies); escalation without a team is dropped; citations normalised (`【1】` → `[1]`).
- **Run row first, then expensive work**: a failure is still recorded (`run.failed` + error).
- **One transaction for the result**: supersede old pending proposals, insert new ones, write
  audit entries, mark the run completed — all or nothing.
- **Supersede instead of piling up**: a new run expires older pending proposals for the same
  ticket (`action.superseded`), so approvers only see the latest suggestion.
- **Ticket text is untrusted**: delimited `<ticket>` block + "data, not instructions" rule.
  Customers write the ticket; prompt injection can come from there.
- **Feature flag on the API**: the agent can be switched off without a deploy.
- **Batch embedding for many tickets** (`warmQueryCache`): 1 Voyage call for 12 tickets instead
  of 12 (free tier: few requests per minute).

## 4. How it works

```
POST /tickets/SAMPLE-003/triage   (or: pnpm triage SAMPLE-003)
  load ticket (external id or uuid)              -> 404 if missing
  insert agent_runs (running, prompt version, trace id)
  retrieve(subject + description) -> distance <= 0.70 -> top 4 sources [1]-[4]
  LLM (JSON mode) -> JSON.parse -> Zod  --invalid--> repair once --invalid--> run failed
  guards (grounded reply, consistent escalation)
  proposals: set_category, set_priority, [draft_reply], [escalate], [add_internal_note]
  transaction: expire old pending (action.superseded) · insert pending · audit · run completed
  -> response: suggestion, proposals (pending, expire in 30 min), sources, usage, trace link
```

Example (SAMPLE-003, "charged twice"):

```
category: billing_inquiry   priority: high ("charged wrongly")
reply:    "... temporary authorization hold that should disappear within 3–5 business days [1].
           ... refund the duplicate charge within 2 business days [1] ..."
proposals: set_category · set_priority · draft_reply · add_internal_note  (all PENDING)
ticket.category is still NULL until a human approves.
```

## 5. Results: a tiny eval on the 12 sample tickets

| Prompt      | Category    | Priority    | Grounded reply |
| ----------- | ----------- | ----------- | -------------- |
| `triage-v1` | 10/12 (83%) | 10/12 (83%) | 12/12          |
| `triage-v2` | **12/12**   | **12/12**   | 12/12          |

The four v1 misses all came from **unclear definitions**: charges vs returns, where installation
help belongs, "missing photos" = data loss, "works but badly" = medium. v2 fixes them with
**general** rules (no ticket-specific rules).

**Caveat:** v2 was tuned on the same 12 tickets, so 100% is optimistic. Real accuracy needs a
separate, larger held-out set (task 7).

## 6. Try it yourself

```bash
pnpm triage SAMPLE-007        # photos lost -> critical
pnpm triage 42                # a real ticket from the dataset
pnpm triage:check             # the 12-ticket eval (~1-2 min, free tier)
```

- In VS Code: `apps/api/requests.http` → "Triage a ticket" and "Ticket with its agent runs".
- In Langfuse: trace **triage** → agent `triage-ticket` → retrieve → `llm.groq` (see the JSON).
- In SQL: `select event, actor, count(*) from audit_log group by 1, 2;`
- Experiment: make a definition vague again in the prompt, run `triage:check`, watch the score drop.

## 7. Problems we faced

| Problem                                                     | Cause                                                         | Fix                                                 | Lesson                               |
| ----------------------------------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------ |
| `main` didn't include the tickets PR when this step started | PR not merged yet                                             | Built on the `feat/seed-tickets` branch             | Check `origin/main` before branching |
| "Charged twice" → refund_request instead of billing_inquiry | Overlapping category definitions                              | Sharper definitions in `triage-v2`                  | Most "model errors" are spec errors  |
| Installation help → product_inquiry                         | Rubric didn't place setup tasks                               | "install/set up/configure" = technical_issue        | Define the edge cases explicitly     |
| Missing photos → high, grinding noise → high                | Rubric too abstract ("data loss", no "works badly" line)      | Concrete examples per priority                      | Examples beat abstract labels        |
| Risk of overfitting the prompt to 12 tickets                | Same set used to find and fix problems                        | Only general rules; held-out set planned (task 7)   | Don't tune and test on the same data |
| Later triage calls 7–13 s                                   | Groq free-tier tokens-per-minute limit; SDK waits and retries | Accepted for dev; pauses between calls in the check | Rate limits shape batch jobs         |
| ESLint: unused variable from a destructuring trick          | `{ content: _c, ...rest }`                                    | Explicit mapping                                    | Clear code beats clever code         |

## 8. Interview questions

**Q: Agent or workflow? How do you decide?**
If the steps are known in advance, use a workflow (code controls flow, LLM fills values): cheaper,
faster, testable. Use an agent loop when the path depends on what the model discovers.

**Q: How do you get reliable structured output from an LLM?**
JSON mode or schema-constrained output, a strict schema (Zod/JSON Schema) with enums, validation
in code, one repair attempt with the errors, and failing safely after that.

**Q: How do you stop an agent from doing something dangerous?**
It can only produce proposals of allow-listed types; code validates and guards them; a human
approves; execution re-validates; everything is audited; a feature flag can switch it off.

**Q: The model picked the "wrong" category. What do you do first?**
Check the specification: are the definitions clear and non-overlapping? Most misses are spec
problems. Fix with general rules, re-run the eval, watch for overfitting.

**Q: How do you evaluate a classifier-like LLM step?**
A labelled set with expected outputs, accuracy per field, a confusion view of the misses,
versioned prompts, and a held-out set that you never tune on.

## 9. Key takeaways

- The model suggests, the code decides what can happen, the human approves.
- Validate structured output; repair once; fail safely.
- Fix the definitions before blaming the model, and don't overfit to your test set.
