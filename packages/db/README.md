# @sta/db

Drizzle ORM schema, migrations and the database client for Postgres + pgvector.

- `src/schema/documents.ts`: `documents` and `chunks` (RAG knowledge base).
- `src/index.ts`: `getDb()` (lazy connection) and `closeDb()`.
- `migrations/`: numbered SQL files, committed to git.
- `scripts/smoke.ts`: rolled-back end-to-end check of the database.
- `drizzle.config.ts`: reads the connection string from `config` (`@sta/shared`), never from `process.env`.

## Commands (from the repo root)

```bash
pnpm db:generate   # after changing src/schema: writes a new migration
pnpm db:migrate    # applies pending migrations to DATABASE_URL
pnpm db:smoke      # checks connection, pgvector, tables, vector search (no data kept)
```

## pgvector

Embeddings are stored with the [pgvector](https://github.com/pgvector/pgvector) extension.
`migrations/0000_enable_pgvector.sql` is hand-written (drizzle-kit does not manage extensions):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

The database must have pgvector installed (the Docker image `pgvector/pgvector` has it; a
host-installed PostgreSQL needs the extension installed separately).

The vector column size equals `EMBEDDING_DIMENSIONS` in `.env`. Changing the embedding model
means a new migration and a re-ingest.
