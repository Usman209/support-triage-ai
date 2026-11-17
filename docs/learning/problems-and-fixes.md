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

## Debugging habits we used

1. **Read the exact error**, then the logs (`docker compose logs <service>`).
2. **Check timestamps**: is the error still happening or only at startup?
3. **Test the real behaviour** (for example an anonymous `curl`), don't trust names or docs.
4. **Change one thing at a time** and re-run the same check.
5. **Never print secrets** while debugging: print "set/empty" or a short prefix instead.
