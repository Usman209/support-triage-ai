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

## Debugging habits we used

1. **Read the exact error**, then the logs (`docker compose logs <service>`).
2. **Check timestamps**: is the error still happening or only at startup?
3. **Test the real behaviour** (for example an anonymous `curl`), don't trust names or docs.
4. **Change one thing at a time** and re-run the same check.
5. **Never print secrets** while debugging: print "set/empty" or a short prefix instead.
