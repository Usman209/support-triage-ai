# Problems and fixes (all steps)

Quick revision list. Each row: what we saw, why it happened, what we did, what to remember.
New problems are added at the bottom of each step's section as we build.

## Step 00: Skeleton

| #   | Symptom                                                  | Cause                                                   | Fix                                  | Lesson                                                          |
| --- | -------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| 1   | Comment-only `.ts` file may fail under `isolatedModules` | TS sees a file without import/export as a global script | `moduleDetection: "force"`           | Understand tsconfig options                                     |
| 2   | Next.js cannot compile `@sta/shared` TypeScript          | Next compiles only its own folder                       | `transpilePackages`                  | Source-only internal packages need the consumer to compile them |
| 3   | `format:check` failed on 5 files                         | Files written before Prettier ran                       | `pnpm format`                        | Format before committing                                        |
| 4   | CI cannot use `--frozen-lockfile`                        | No lockfile yet                                         | Commit `pnpm-lock.yaml`, then switch | Lockfiles = repeatable installs                                 |

## Step 01: Configuration

| #   | Symptom                                                 | Cause                   | Fix                                              | Lesson                                |
| --- | ------------------------------------------------------- | ----------------------- | ------------------------------------------------ | ------------------------------------- |
| 5   | Inline `# comments` in `.env` read differently by tools | Parsers differ          | Comments on their own line                       | Use the format every tool agrees on   |
| 6   | `KEY=` passed as empty string                           | `""` is a valid string  | Treat blank as missing                           | Normalize input before validating     |
| 7   | Langfuse keys appeared twice in `.env`                  | Copy-paste              | Merged; one line each                            | Last value wins; duplicates hide bugs |
| 8   | Needed to update `.env` without losing real keys        | File had user's secrets | Fill only blank keys, backup, never print values | Never overwrite or print secrets      |

## Step 02: Docker, Postgres, MinIO

| #   | Symptom                                                          | Cause                                                                            | Fix                             | Lesson                                              |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------- |
| 9   | `pull access denied` for `minio/minio`, 401 from `quay.io/minio` | MinIO stopped publishing images                                                  | `bitnamilegacy/minio:2025.4.22` | Pin versions; archived images = no security updates |
| 10  | `minio-init`: connection refused although "healthy"              | Bitnami starts, stops, restarts MinIO; healthcheck passed on the first short run | Retry loop in init script       | Healthy once ≠ ready now; clients must retry        |
| 11  | Public bucket could be listed anonymously                        | `download` preset includes `ListBucket`                                          | Custom policy: `GetObject` only | Test security with an anonymous request             |
| 12  | Starting one service failed on other services' missing vars      | Compose interpolates the whole file                                              | Fill all required values        | Compose validates the entire file                   |
| 13  | Safety check blocked `mc rm` in a test                           | Destructive command in a script                                                  | Removed it; manual cleanup      | Avoid deletes in test scripts                       |

## Step 03: Langfuse

| #   | Symptom                                            | Cause                                     | Fix                              | Lesson                              |
| --- | -------------------------------------------------- | ----------------------------------------- | -------------------------------- | ----------------------------------- |
| 14  | "What is the username/password?" on local Langfuse | Self-hosted starts with no users          | Sign up (or `LANGFUSE_INIT_*`)   | Self-hosted tools often start empty |
| 15  | Cloud keys don't work on local instance            | Keys belong to one instance               | Use Cloud host                   | Match keys to host/region           |
| 16  | Worker "table does not exist" errors               | Worker started before migrations finished | None needed; stopped after 15s   | Check timestamps; startup order     |
| 17  | 6 unused containers running                        | Switched to Cloud                         | Compose profile `langfuse-local` | Don't run what you don't use        |

## Step 04: Starter app

| #   | Symptom                    | Cause                           | Fix                     | Lesson                      |
| --- | -------------------------- | ------------------------------- | ----------------------- | --------------------------- |
| 18  | No URL to open             | Only placeholders existed       | Minimal API + web shell | Walking skeleton early      |
| 19  | Ports 3000/3001 busy       | Other local containers          | 3010/3011 via `.env`    | Configurable ports          |
| 20  | Next.js ignores `WEB_PORT` | Next reads `PORT`/`--port` only | Launcher script         | Bridge tools to your config |
| 21  | First load ~13s            | Dev mode compiles on demand     | None                    | Dev speed ≠ prod speed      |

## Step 05: Discovery brief

| #   | Symptom                          | Cause                               | Fix                                                      | Lesson                                     |
| --- | -------------------------------- | ----------------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| 22  | No interview answers and no data | Learning project; CSV not added yet | Draft with labelled assumptions **[A]** + open questions | Write assumptions down; get them confirmed |
| 23  | Baseline numbers unknown         | No dataset                          | "Measure from dataset" placeholder                       | A target without a baseline is a guess     |

## Step 06: RAG database tables

| #   | Symptom                                                 | Cause                                                                      | Fix                                                                        | Lesson                                                            |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 24  | No `CREATE EXTENSION vector` in generated SQL           | drizzle-kit doesn't manage extensions                                      | Hand-written custom migration 0000                                         | Hand-written DB setup still goes in a versioned migration         |
| 25  | Migration "succeeded" but Docker Postgres had no tables | Two Postgres servers on port 5436; the Windows one received the connection | Checked port owner; chose Windows Postgres 18; Docker Postgres made opt-in | Verify where you are connected: `current_database()`, `version()` |
| 26  | Notice: extension "vector" already exists               | pgvector already enabled in that DB                                        | None: `IF NOT EXISTS`                                                      | Migrations must be safe on non-empty databases                    |
| 27  | Test script: top-level await not supported (cjs)        | Script outside the project                                                 | Moved into repo as `pnpm db:smoke`                                         | Keep useful checks in the repo                                    |

## Step 07: LLM providers

| #   | Symptom                                               | Cause                                           | Fix                                                                        | Lesson                                             |
| --- | ----------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------- |
| 28  | `temperature` would 400 on Claude                     | Current Claude models reject it                 | Send `effort` instead; temperature only for open models                    | APIs drift; check current docs                     |
| 29  | 1024 max tokens too low                               | Thinking counts toward the limit                | 4096                                                                       | Budget for thinking + answer                       |
| 30  | OpenAI `429 credit_balance_exhausted`                 | No credit (billing), not a rate limit           | Voyage embeddings (free tokens)                                            | Read the error code; don't retry billing errors    |
| 31  | Anthropic `400 credit balance too low`                | No credit; keys valid (no 401)                  | Groq chat (free tier)                                                      | Provider interface = config switch                 |
| 32  | Chat test never ran                                   | First failure stopped the script                | Run/report each test separately                                            | Tests must not hide each other                     |
| 33  | Vector size 1536 → 1024                               | Voyage model size                               | Migration 0002                                                             | New embedding model = migration + re-embed         |
| 34  | `db:smoke` had 1536 hardcoded                         | Broke "settings only in .env"                   | Read from config                                                           | Hardcoded values hide until change                 |
| 35  | Voyage response format missing from main docs         | Docs split across pages                         | Read the API reference                                                     | Verify field names at the source                   |
| 36  | Groq: 404 model_not_found for llama-3.3-70b-versatile | Docs page listed models this account cannot use | Asked the API: GET /models; chose gpt-oss-120b / gpt-oss-20b / qwen3.8-27b | Ask the API what is available; docs pages go stale |

## Step 08: RAG ingestion

| #   | Symptom                                                      | Cause                                   | Fix                                                             | Lesson                                              |
| --- | ------------------------------------------------------------ | --------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------- |
| 37  | Ticket CSV placed in data/knowledge-base/                    | Folder mix-up; that folder is committed | Moved to data/raw/ (gitignored), verified with git check-ignore | Customer data in a committed folder = PII on GitHub |
| 38  | Dataset labels match only at chance (21% vs 20%, 26% vs 25%) | Synthetic data with random labels       | Own labelled test set in task 7                                 | Check your data before trusting metrics             |
| 39  | CSV has no help articles                                     | Tickets are questions, not answers      | 16 sample articles, one per subject                             | RAG needs a knowledge source                        |
| 40  | Free-tier embedding rate limits                              | Few requests/minute                     | One batched call; honour Retry-After                            | Design for rate limits                              |
| 41  | @sta/ai needed Drizzle helpers                               | pnpm strict dependencies                | Re-export from @sta/db                                          | One library version across packages                 |
| 42  | Paths broke depending on working folder                      | Resolved from cwd                       | Resolve from project root                                       | Resolve paths from a fixed anchor                   |
| 43  | hit@1 100%                                                   | Easy, self-written test questions       | Treat as regression baseline                                    | Easy test sets are optimistic                       |

## Step 09: /chat API

| #   | Symptom                                         | Cause                         | Fix                                                    | Lesson                                      |
| --- | ----------------------------------------------- | ----------------------------- | ------------------------------------------------------ | ------------------------------------------- |
| 44  | Unknown "relevant" cut-off                      | Distance distribution unknown | Measured: relevant ≤0.53, off-topic ≥0.76 → 0.70       | Choose thresholds from data                 |
| 45  | Related-but-uncovered questions pass the filter | Shared words                  | Exact "not found" sentence in prompt, detected in code | Cheap filter + model judgment               |
| 46  | Citations empty although answer cited           | gpt-oss wrote 【1】 not [1]   | Normalise citation variants                            | Test with the real model; normalise outputs |
| 47  | Answers contain **bold** Markdown               | Model formatting              | Render Markdown in the UI (step 10)                    | Decide how to display model output          |

## Step 10: Chat UI

| #   | Symptom                               | Cause                                        | Fix                                        | Lesson                                   |
| --- | ------------------------------------- | -------------------------------------------- | ------------------------------------------ | ---------------------------------------- |
| 48  | Browser → API needs CORS              | Different ports/origins                      | Next.js /api/chat proxy                    | BFF avoids CORS, hides internal URLs     |
| 49  | Model output could contain HTML       | LLM text is untrusted                        | Render as React elements only              | Treat model output like user input (XSS) |
| 50  | Source panel raw **bold**, hard wraps | Stored chunk text shown as-is                | Safe renderer with softWrap                | Format stored text for humans            |
| 51  | Echo setup → "not found"              | Prompt v1 over-refusal on generic article    | Prompt answer-v2 + 5-case regression       | Test both hallucination and over-refusal |
| 52  | One answer 24 s                       | Voyage 429, retry waited 20 s                | Query-embedding LRU cache                  | Retries cost latency; caches avoid calls |
| 53  | 400 px screenshots cut off            | Headless browser min width + transform trick | main:has(.chat-layout); verify in DevTools | Know your test tool limits               |
| 54  | Headless Edge hung                    | Two instances at once                        | One at a time with timeout                 | Timeouts on external tools               |
| 55  | eslint-disable for missing rule       | react-hooks plugin not installed             | Removed comment                            | Disable comments must name real rules    |

## Step 11: Langfuse tracing

| #   | Symptom                                           | Cause                                             | Fix                                       | Lesson                                        |
| --- | ------------------------------------------------- | ------------------------------------------------- | ----------------------------------------- | --------------------------------------------- |
| 56  | Langfuse SDK needs Node 22                        | OpenTelemetry-based SDK                           | engines, .nvmrc, CI → 22                  | Check requirements before adding dependencies |
| 57  | SDK reads LANGFUSE_BASE_URL, we use LANGFUSE_HOST | Different env names                               | Pass values explicitly from config        | One source of config                          |
| 58  | Scripted edit broke code (backticks ran in shell) | Template literals in a double-quoted shell string | Use the editor tool / script files        | Never put backtick code in shell strings      |
| 59  | EADDRINUSE :3011 after edits                      | tsx watch restarted twice quickly                 | Verified the serving process had new code | Know your dev tools' restart behaviour        |
| 60  | Langfuse trace API 410 Gone                       | Endpoint removed 2026-11-16                       | /api/public/v2/observations               | Read the error body                           |
| 61  | First trace never arrived                         | Langfuse briefly unreachable                      | Retried after health 200                  | Tracing is best-effort; requests unaffected   |
| 62  | "view trace" link missing                         | Dev server served an old bundle                   | Restarted pnpm dev:web                    | Check what the server actually serves         |

## Step 12: Agent data model

| #   | Symptom                                     | Cause                                | Fix                                   | Lesson                                 |
| --- | ------------------------------------------- | ------------------------------------ | ------------------------------------- | -------------------------------------- |
| 63  | Docs PR not merged when Task 4 started      | origin/main still at PR #6           | Branched from the docs branch         | Check origin/main before branching     |
| 64  | Drizzle can't express append-only           | ORMs model tables, not triggers      | Hand-written migration with triggers  | Must-hold rules belong in the database |
| 65  | Cascade would erase audit history           | FK with onDelete cascade             | No FK on audit_log.ticket_id          | Audit outlives the data it describes   |
| 66  | Expected error aborted the test transaction | Postgres aborts after any error      | SAVEPOINT per expected failure        | Savepoints for testing errors          |
| 67  | db:smoke "74 chunks left after cascade"     | Counted all chunks incl. the real KB | Count only the test document's chunks | Tests must not depend on other data    |

## Step 13: Load tickets

| #   | Symptom                                      | Cause                       | Fix                               | Lesson                              |
| --- | -------------------------------------------- | --------------------------- | --------------------------------- | ----------------------------------- |
| 68  | PII inside free text (80 emails, 188 phones) | Contact details in messages | Regex redaction while loading     | Dropping PII columns is not enough  |
| 69  | ~150 kinds of {placeholders}                 | Template-generated data     | Known mapped, unknown → […]       | Profile data before cleaning rules  |
| 70  | Line breaks/quotes in descriptions           | CSV quoting                 | csv-parse                         | Don't hand-roll CSV parsing         |
| 71  | Re-load could erase approved triage          | Naive upsert                | Update source fields only; tested | Decide which system owns each field |
| 72  | Phone regex may over-redact                  | Errs on the safe side       | Accepted; PII detector in task 8  | Redaction recall vs precision       |

## Step 14: Triage agent

| #   | Symptom                              | Cause                            | Fix                                   | Lesson                               |
| --- | ------------------------------------ | -------------------------------- | ------------------------------------- | ------------------------------------ |
| 73  | Tickets PR not in main               | Not merged yet                   | Built on feat/seed-tickets            | Check origin/main before branching   |
| 74  | "Charged twice" → refund_request     | Overlapping category definitions | triage-v2 definitions                 | Most model errors are spec errors    |
| 75  | Installation help → product_inquiry  | Edge case undefined              | Setup/configure = technical_issue     | Define edge cases explicitly         |
| 76  | Missing photos/noise mis-prioritised | Abstract rubric                  | Concrete examples per level           | Examples beat abstract labels        |
| 77  | Overfitting risk                     | Tuned and tested on the same 12  | General rules; held-out set in task 7 | Never tune and test on the same data |
| 78  | Later calls 7–13 s                   | Groq tokens-per-minute limit     | SDK retries; pauses                   | Rate limits shape batch jobs         |
| 79  | Lint: unused destructured var        | Clever destructuring             | Explicit mapping                      | Clear beats clever                   |

## Step 15: Approvals

| #   | Symptom                                   | Cause                             | Fix                                                       | Lesson                                           |
| --- | ----------------------------------------- | --------------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| 80  | Triage PR not in main                     | Not merged yet                    | Built on feat/triage-agent + merged main                  | Check origin/main before branching               |
| 81  | Browser needs @sta/shared constants       | Package also has config.ts (.env) | @sta/shared/client entry                                  | Separate server-only and browser-safe modules    |
| 82  | Two approvals at once                     | Read-then-write race              | Atomic conditional UPDATE                                 | Let the database decide races                    |
| 83  | Invalid edit would consume approval       | Claim before validation           | Validation error rolls back the transaction               | Order operations so failures leave a clean state |
| 84  | No ticketing system to execute into       | Integration later                 | Results on ticket columns/metadata; one executor function | Keep side effects behind one swappable function  |
| 85  | Same ticket, different priority on re-run | LLM non-determinism               | Human approval; repeated eval runs                        | Measure variance                                 |

## Debugging habits we used

1. **Read the exact error**, then the logs (`docker compose logs <service>`).
2. **Check timestamps**: is the error still happening or only at startup?
3. **Test the real behaviour** (for example an anonymous `curl`), don't trust names or docs.
4. **Change one thing at a time** and re-run the same check.
5. **Never print secrets** while debugging: print "set/empty" or a short prefix instead.
