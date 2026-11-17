# Discovery brief (task 1)

> **Status: DRAFT based on assumptions.** Items marked **[A]** are assumptions made because we have
> no client interview or data yet. Confirm or correct them, then mark this brief as approved.
> Last updated: 2026-11-17.

## One-line summary

An **assistant for support agents** (not a customer chatbot) that triages each new ticket, suggests
a reply grounded in help-centre articles, and proposes actions that a human must approve.

## User

| Who                                        | Role                                       | What they need from us                                  |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------- |
| **Tier-1 support agent** (primary) **[A]** | Reads and answers incoming tickets all day | Fast triage, the right help article, a good first draft |
| **Support team lead** (secondary) **[A]**  | Owns queues, quality and escalations       | Approve risky actions, see volume, quality and cost     |

The customer **never talks to the AI directly**. A human reads every suggestion before anything
reaches the customer. This keeps risk low while we learn how good the system is.

## Pain point

**[A]** For every new ticket an agent must:

1. Read it and decide **type/category** and **priority** (manual, inconsistent between agents).
2. Search the help centre for the right article (slow; agents don't remember every article).
3. Write a first reply from scratch (repetitive for common issues).

Results: slow **first response**, tickets sent to the wrong queue and re-assigned, and inconsistent
answers to the same question.

Evidence to collect from `customer_support_tickets.csv` once it is in `data/raw/`: ticket volume,
distribution of types/priorities, first-response time and resolution time (if the columns exist).

## Success metric

**North-star metric [A]: median time to first response (TTFR) for tickets the assistant helped with.**
Baseline: measured from the dataset/current process. Target: **30% lower** than baseline.

Supporting metrics (each one is checked by evals or the dashboard later):

| Metric                                                | Target **[A]**                                   | How we measure                                   | Task  |
| ----------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------ | ----- |
| Category accuracy                                     | ≥ 85%                                            | Prediction vs human label on a labelled test set | 3, 7  |
| Priority accuracy                                     | ≥ 80%                                            | Same                                             | 3, 7  |
| Groundedness (answer supported by retrieved articles) | ≥ 0.90                                           | LLM-as-judge / Ragas faithfulness                | 7, P1 |
| Retrieval hit rate (right article in top 4)           | ≥ 80%                                            | Labelled question → article pairs                | 3, P1 |
| Reply acceptance (sent with no or small edits)        | ≥ 50%                                            | Approval UI: approve vs edit vs reject           | 4, 10 |
| Latency p95 per suggestion                            | ≤ 8 s                                            | Langfuse traces                                  | 10    |
| Cost                                                  | ≤ $0.02 per ticket, ≤ `DAILY_BUDGET_USD` per day | Langfuse cost tracking                           | 10    |
| Unsafe actions executed without approval              | **0**                                            | Audit log                                        | 4, 8  |

## Agent actions and approval rules

| Action                                                | Approval needed?                      | Why                              |
| ----------------------------------------------------- | ------------------------------------- | -------------------------------- |
| Search help centre, read ticket, find similar tickets | No (read-only)                        | Cannot change anything           |
| Set category / priority                               | **Yes [A]**                           | Wrong value misroutes the ticket |
| Draft a reply                                         | **Yes**: the agent edits and sends it | Customer-facing text             |
| Add internal note                                     | **Yes [A]**                           | Visible to the team              |
| Escalate / assign to a team                           | **Yes**                               | Moves work between people        |
| Send to customer, close ticket, refund, delete        | **Never by the AI**                   | High impact, out of scope        |

`AGENT_REQUIRE_APPROVAL=true` and `FEATURE_AGENT_ENABLED=false` in `.env` reflect these rules.

## Constraints

- **Privacy [A]**: tickets contain PII (names, emails, maybe order or payment details). PII is
  **redacted before** text goes to the LLM or to Langfuse (`PII_REDACTION_ENABLED=true`). Raw data
  stays in `data/raw/` (gitignored).
- **Cost**: hard cap `DAILY_BUDGET_USD` (5 USD/day in development). Cheap model for simple steps
  (`MODEL_CHEAP`), strong model only where needed (`MODEL_CHAT`).
- **Latency**: suggestion ready in ≤ 8 s (p95) so it is useful while the agent opens the ticket.
- **Language [A]**: English only in version 1.
- **Data**: only public help-centre content in the knowledge base; no training or fine-tuning on
  customer data.
- **Integration [A]**: no real ticketing system yet. We use the CSV and a mock ticketing tool;
  the real API comes later (`TICKETING_API_URL`).

## Risks and mitigations

| Risk                                                    | Impact                 | Mitigation                                                                           | Task  |
| ------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------ | ----- |
| Hallucinated answer (not in the help centre)            | Wrong info to customer | Answer only from retrieved articles, show citations, groundedness evals, human sends | 3, 7  |
| Wrong action (bad priority, wrong escalation)           | Misrouted tickets      | Human approval for every write action, audit log                                     | 4     |
| PII leak to LLM provider or traces                      | Privacy/legal          | Redaction before LLM and tracing, data minimisation                                  | 8     |
| Prompt injection inside a ticket ("ignore your rules…") | Agent misbehaves       | Injection checks, tools limited by allow-list, approval gate                         | 8     |
| Cost overrun                                            | Budget                 | Daily budget guard, cheap model routing, token limits                                | 8, 10 |
| Poor retrieval (wrong article)                          | Bad answers            | Chunking/rerank tuning, retrieval evals                                              | 3, P1 |
| Agents stop checking AI output (automation bias)        | Errors pass through    | Clear citations, confidence signals, acceptance metrics                              | 4, 10 |

## Out of scope (version 1)

- Sending replies or closing tickets automatically.
- A customer-facing chatbot.
- Refunds, billing changes, account deletion.
- Languages other than English; voice/phone channels.
- Fine-tuning models.
- Integration with a real ticketing system (mock only for now).

## Open questions (to confirm)

1. Is the primary user really the tier-1 agent? Or team leads, or customers?
2. Is time-to-first-response the metric that matters most, or routing accuracy?
3. Are the approval rules above right (for example, may category be set **without** approval)?
4. Which help centre should be our knowledge base?
5. Is sending ticket text to an external LLM allowed after PII redaction?

## Sign-off

- [ ] Assumptions reviewed and confirmed
- [ ] Baseline numbers filled from the dataset
