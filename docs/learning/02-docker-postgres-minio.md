# Step 02: Local infrastructure (Docker, Postgres + pgvector, MinIO)

> **Update (step 06):** the app now uses a PostgreSQL 18 installed on Windows (`DATABASE_URL`).
> The Docker Postgres below is opt-in: `pnpm infra:up:postgres-local`. See
> [06-rag-database-schema.md](06-rag-database-schema.md) for why (port clash).

## 1. Goal

Run the services the app needs on your laptop with one command, configured from `.env`.

## 2. What we built

| Service      | Image                           | Port                                | Purpose                                     |
| ------------ | ------------------------------- | ----------------------------------- | ------------------------------------------- |
| `postgres`   | `pgvector/pgvector:pg16`        | `POSTGRES_PORT` (5436 in your .env) | App database + vector search                |
| `minio`      | `bitnamilegacy/minio:2025.4.22` | 9000 (S3 API), 9001 (console)       | File storage, S3-compatible                 |
| `minio-init` | same image                      | none                                | One-time setup: buckets, policies, app user |

Files: `infra/docker/docker-compose.yml`, `infra/docker/minio/minio-init.sh`.

MinIO setup result:

| Item                | Value                                           | Access                                                                          |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| Bucket `langfuse`   | private                                         | app user only                                                                   |
| Bucket `public`     | public read by direct URL                       | anyone can download a file if they know its URL; **nobody can list** the bucket |
| Policy `sta-app-rw` | read/write objects in those 2 buckets           | no bucket creation, no admin                                                    |
| User `sta-app`      | `MINIO_APP_ACCESS_KEY` / `MINIO_APP_SECRET_KEY` | used by the app (never root)                                                    |

## 3. Why this way

- **Docker Compose**: same versions for every developer, start/stop with one command, no installs
  on your machine.
- **Postgres + pgvector instead of a separate vector database**: one database for tickets,
  approvals **and** embeddings. Fewer moving parts, SQL joins, transactions, backups you already
  know. A dedicated vector DB (Pinecone, Qdrant) is worth it only at very large scale.
- **MinIO**: S3-compatible storage locally. The same code works later with AWS S3 or Azure (through
  an S3 gateway) by changing only `.env`.
- **Values from `.env` with `${VAR:?message}`**: Compose stops with a clear message if a value is
  missing. No passwords written in the YAML.
- **Least privilege**: the app uses a user that can only read/write objects in two buckets. If the
  app key leaks, the attacker cannot delete buckets or create admin users.
- **Idempotent init script**: safe to run many times (`--ignore-existing`, "update if exists").
  Re-running setup never breaks anything.
- **Pinned image versions**: `:latest` changes without warning. Pinned versions make the setup
  repeatable.

## 4. How it works

```
pnpm infra:up
  = docker compose --env-file .env -f infra/docker/docker-compose.yml up -d
    1. postgres starts, healthcheck = pg_isready
    2. minio starts, healthcheck = curl /minio/health/live
    3. minio-init waits for minio "healthy", then runs minio-init.sh:
         wait until MinIO really answers (retry loop)
         create buckets -> set public read policy -> create app policy -> create user -> attach
       then exits with code 0
```

`--env-file .env` matters: Compose normally reads `.env` from the folder of the compose file
(`infra/docker/`). We point it at the root `.env` so there is only one `.env`.

## 5. Try it yourself

```bash
pnpm infra:up
docker compose --env-file .env -f infra/docker/docker-compose.yml ps
# MinIO console: http://localhost:9001  (login: MINIO_ROOT_USER / MINIO_ROOT_PASSWORD)
curl -I http://localhost:9000/public/          # 403: listing is blocked
docker compose --env-file .env -f infra/docker/docker-compose.yml logs minio-init
```

## 6. Problems we faced

| Problem                                                                | Cause                                                                                                                                    | Fix                                                                                                                   | Lesson                                                                                                                                                  |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pull access denied for minio/minio` and `401` from `quay.io/minio`    | MinIO stopped publishing community Docker images in late 2025                                                                            | Used `bitnamilegacy/minio:2025.4.22` (frozen archive of release 2025-04-22, the last one with the full admin console) | Open-source projects change licences and distribution. Pin versions and know your fallback. Archived images get **no security updates**: local dev only |
| `minio-init` failed: `connection refused` although MinIO was "healthy" | The Bitnami image starts MinIO once for its own setup, stops it, then starts it again. The healthcheck passed during the first short run | Retry loop in `minio-init.sh` (`until mc alias set ... && mc ready ...`)                                              | "Healthy" once does not mean "ready now". Make clients retry                                                                                            |
| Anyone could **list** all files in the public bucket                   | MinIO's built-in `download` preset allows `s3:ListBucket` too                                                                            | Custom policy with only `s3:GetObject`                                                                                | Check what a preset really allows. Test with an anonymous request                                                                                       |
| `docker compose up minio` failed on missing **Langfuse** passwords     | Compose resolves variables in the **whole** file, even for one service                                                                   | Filled all required values in `.env` (random, generated locally)                                                      | Compose validates the whole file                                                                                                                        |
| Safety check blocked `mc rm` in a test command                         | Delete commands in scripts are treated carefully                                                                                         | Removed the delete step; test file left for manual cleanup                                                            | Avoid destructive commands in tests; clean up by hand when unsure                                                                                       |

## 7. Interview questions

**Q: Why pgvector and not a vector database?**
Simpler operations: one database, SQL, transactions, joins with ticket data, normal backups. It
handles millions of vectors with HNSW indexes. A dedicated vector DB makes sense for very large
scale or special features.

**Q: What does "S3-compatible" mean?**
It speaks the same HTTP API as Amazon S3, so S3 SDKs and tools work with it. You change the endpoint
URL, not the code.

**Q: What is least privilege?**
Give each user or service only the permissions it needs. Our app user can read/write objects in two
buckets and nothing else.

**Q: What is an idempotent script and why does it matter?**
Running it once or ten times gives the same result. Deploy and setup scripts are often re-run
(retries, restarts), so they must be idempotent.

**Q: Healthcheck vs readiness?**
Liveness: "is the process alive?". Readiness: "can it serve requests right now?". Clients should
still retry, because a service can restart after it was reported ready.

**Q: Why not `:latest` images?**
Not reproducible: the image can change any day and break your setup. Pin a version and upgrade on
purpose.

## 8. Key takeaways

- One command to start everything; all values from `.env`.
- Least privilege for every credential.
- Make setup idempotent and add retries.
- Verify security settings by testing them (anonymous `curl`), not by trusting a name like "download".
