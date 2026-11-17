# Step 03: Observability with Langfuse (Cloud vs self-hosted)

## 1. Goal

See what the AI does: every prompt, model response, token count, cost, latency and error. In
**production** AI work, you cannot fix what you cannot see.

## 2. What we built

- Langfuse **Cloud** (EU region) is the default: `LANGFUSE_HOST=https://cloud.langfuse.com`,
  with your project keys in `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY`.
- Keys were verified with a real API call (`GET /api/public/projects` returned 200).
- A **self-hosted** Langfuse stack is still in `docker-compose.yml`, but **opt-in** with a Compose
  profile: `pnpm infra:up:langfuse-local`. It does not start with `pnpm infra:up`.

## 3. Why this way

- **Why tracing for LLM apps**: LLM output is non-deterministic. When a user says "the answer was
  wrong", you need the exact prompt, retrieved documents and model response to find out why.
- **Cloud vs self-hosted**:

|                | Cloud                                  | Self-hosted                                                |
| -------------- | -------------------------------------- | ---------------------------------------------------------- |
| Setup          | Sign up, copy 2 keys                   | 6 containers: web, worker, Postgres, ClickHouse, Redis, S3 |
| Maintenance    | None                                   | Upgrades, backups, disk                                    |
| Data location  | Langfuse servers (choose EU/US region) | Your machines                                              |
| When to choose | Learning, small teams, fast start      | Strict data rules (PII must stay in-house), large scale    |

We use Cloud now. Because PII may appear in traces, task 8 adds **PII redaction before tracing**.

- **Compose profiles**: keep the optional stack in the file (documented, ready to use) without
  running it every day.

## 4. How it works (self-hosted Langfuse v3, for reference)

```
langfuse-web     UI + API (port 3002 on your machine)
langfuse-worker  background jobs (processes events)
langfuse-db      Postgres: users, projects, settings
clickhouse       fast analytics database: traces, observations, scores
redis            queue between web and worker
minio            stores raw event files (bucket "langfuse")
```

Later (task 3+), the app sends a **trace** per request, with **spans** inside it: retrieval,
reranking, the LLM call, tool calls.

## 5. Try it yourself

```bash
# Cloud: open your project at https://cloud.langfuse.com  -> Traces (empty until task 3)
# Self-hosted (optional):
pnpm infra:up:langfuse-local      # UI at http://localhost:3002, click "Sign up" (local account)
pnpm infra:down                   # stops everything, including the profile
```

## 6. Problems we faced

| Problem                                                     | Cause                                                                | Fix                                                                                                          | Lesson                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Local Langfuse login page: "what is the username/password?" | Self-hosted Langfuse has no default user                             | Click **Sign up** to create the first local account (or use `LANGFUSE_INIT_*` variables for automatic setup) | Self-hosted tools often start empty                        |
| Keys from Cloud did not match the local instance            | Each Langfuse instance has its own projects and keys                 | Decided to use Cloud; set `LANGFUSE_HOST` to Cloud                                                           | Keys belong to one instance/region                         |
| Worker logged "table does not exist" errors at startup      | Worker started before the web container finished database migrations | Nothing: errors stopped after ~15s when migrations finished                                                  | Startup order matters; check timestamps before panicking   |
| 6 extra containers running but not used                     | We moved to Cloud                                                    | Compose profile `langfuse-local`; stopped and removed the containers (volumes kept)                          | Don't run what you don't use; keep it easy to turn back on |

## 7. Interview questions

**Q: What is LLM observability?**
Recording each LLM request as a trace with its inputs, outputs, tokens, cost, latency and errors,
plus scores (user feedback, eval results), so you can debug, compare prompt versions and control cost.

**Q: Trace vs span?**
A trace is one full request (one user question). Spans are the steps inside it (retrieve docs, call
model, run tool). Spans show where time and money go.

**Q: Cloud or self-hosted for an enterprise client?**
Ask about data rules first. If PII or regulated data is in prompts, either redact before sending,
choose the right region with a data processing agreement, or self-host.

**Q: What metrics would you watch in production?**
Latency (p50/p95), cost per request and per day, error rate, token usage, retrieval quality,
user feedback, and eval scores over time.

## 8. Key takeaways

- Observability is a day-one feature for AI apps, not an afterthought.
- Choose Cloud vs self-hosted by data rules and team size.
- Redact sensitive data before it leaves your system.
