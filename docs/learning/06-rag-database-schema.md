# Step 06 (Task 3.1): RAG database tables (pgvector)

## 1. Goal

Create the tables that will hold the knowledge base for RAG: the **documents** (help articles) and
their **chunks** with an **embedding vector** each, plus an index for fast similarity search.

## 2. What we built

| File                                                   | What                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| `packages/db/src/schema/documents.ts`                  | Tables `documents` and `chunks` (Drizzle ORM)                      |
| `packages/db/src/schema/index.ts`                      | Exports all tables                                                 |
| `packages/db/src/index.ts`                             | `getDb()` (lazy connection) and `closeDb()`                        |
| `packages/db/drizzle.config.ts`                        | Migration tool settings; DB URL from `config`                      |
| `packages/db/migrations/0000_enable_pgvector.sql`      | Hand-written: `CREATE EXTENSION IF NOT EXISTS vector`              |
| `packages/db/migrations/0001_rag_documents_chunks.sql` | Generated: tables, foreign key, indexes                            |
| `packages/db/scripts/smoke.ts`                         | Test: connect, insert, vector search, cascade delete, **rollback** |
| `package.json`                                         | `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:smoke`             |
| `infra/docker/docker-compose.yml`                      | Docker Postgres is now opt-in (profile `postgres-local`)           |

Tables:

```
documents                         chunks
-----------------------------     ----------------------------------------------
id            uuid  PK            id           uuid  PK
source        text  UNIQUE        document_id  uuid  FK -> documents.id (cascade)
title         text                chunk_index  int   UNIQUE(document_id, chunk_index)
content_hash  text                content      text
metadata      jsonb               token_count  int
created_at    timestamptz         embedding    vector(1536)   HNSW index (cosine)
updated_at    timestamptz         metadata     jsonb
                                  created_at   timestamptz
```

## 3. Why this way

- **Two tables, not one**: a document has many chunks. The document row keeps the source and a
  content hash; the chunk rows keep the searchable pieces. One-to-many with a foreign key.
- **`source` is unique**: re-running ingestion updates the same document instead of duplicating it
  (idempotent ingestion).
- **`content_hash`**: if a file did not change, skip re-embedding. Embeddings cost money and time.
- **`ON DELETE CASCADE`**: delete a document and its chunks go too. No orphan chunks that could
  still be retrieved after the article is gone.
- **`UNIQUE(document_id, chunk_index)`**: each position in a document exists once.
- **`vector(1536)`**: the size must equal the embedding model output (`text-embedding-3-small`).
  The size comes from `EMBEDDING_DIMENSIONS` in `.env`, not hardcoded.
- **HNSW index with cosine distance**: finds the nearest vectors fast (approximate) instead of
  comparing the query with every row. Cosine is the usual distance for text embeddings.
- **`jsonb metadata`**: flexible extra fields (url, heading, product) without changing the schema.
- **Drizzle ORM**: schema in TypeScript, typed queries, SQL migrations you can read and commit.
- **Migrations, not "create tables by hand"**: every database change is a numbered SQL file in git.
  Every environment applies the same files in the same order.
- **Lazy connection (`getDb()`)**: importing the package doesn't open a connection; scripts and tests
  stay fast and controllable. `closeDb()` lets scripts exit cleanly.
- **Smoke test in a transaction that rolls back**: proves the real database works without leaving
  test data.

## 4. How it works

```
pnpm db:generate   drizzle-kit reads src/schema -> compares with migrations/meta -> writes new SQL
pnpm db:migrate    drizzle-kit applies migrations not yet applied (tracked in drizzle.__drizzle_migrations)
pnpm db:smoke      insert doc + 3 chunks -> nearest-neighbour query -> delete doc -> ROLLBACK
```

Vector search query (what retrieval will do in step 09):

```sql
select content, embedding <=> $query_vector as cosine_distance
from chunks
order by embedding <=> $query_vector   -- uses the HNSW index on big tables
limit 8;                               -- RAG_TOP_K
```

Smoke test result:

| chunk | content                    | cosine distance                     |
| ----- | -------------------------- | ----------------------------------- |
| 0     | How to reset your password | 0.000 (same direction as the query) |
| 2     | Change your email address  | 0.116 (similar)                     |
| 1     | Refund policy for orders   | 1.000 (unrelated)                   |

Cosine distance: **0 = same meaning, 1 = unrelated, 2 = opposite**.

## 5. Try it yourself

```bash
pnpm db:smoke                      # safe: everything is rolled back
pnpm db:generate                   # after changing a schema file
pnpm db:migrate                    # apply new migrations
# look at the SQL Drizzle wrote:
cat packages/db/migrations/0001_rag_documents_chunks.sql
```

Exercise: add a `language text` column to `documents`, run `pnpm db:generate`, and read the new
migration file. (Then delete that file and revert the change if you don't want to keep it.)

## 6. Problems we faced

| Problem                                                         | Cause                                                                                                                       | Fix                                                                                                                                                  | Lesson                                                                                                         |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| drizzle-kit does not create the `vector` extension              | It only generates tables/indexes, not extensions                                                                            | Custom migration `0000_enable_pgvector.sql` (`drizzle-kit generate --custom`)                                                                        | Some DB setup must be written by hand; put it in a migration so it is still versioned                          |
| Migration said "success" but the Docker Postgres had no tables  | **Two Postgres servers on port 5436**: one installed on Windows and the Docker one. Windows' server received the connection | Checked who listens on the port (`Get-NetTCPConnection`), asked which DB to use: **Windows Postgres 18**. Docker Postgres moved to an opt-in profile | "Success" means success **somewhere**. Verify where you are connected (`select current_database(), version()`) |
| Notice: `extension "vector" already exists, skipping`           | pgvector was already enabled in the Windows DB                                                                              | Nothing: `IF NOT EXISTS` made it safe                                                                                                                | Write migrations that can run on databases that are not empty                                                  |
| Test script failed: "Top-level await is not supported with cjs" | Script was outside the project (no `"type": "module"`) and couldn't import project packages                                 | Moved it into the project as `packages/db/scripts/smoke.ts`                                                                                          | Keep useful checks in the repo, not in temp folders                                                            |

## 7. Interview questions

**Q: Why store embeddings in Postgres?**
One database for app data and vectors: joins (chunk → document → product), transactions, backups,
access control. pgvector with HNSW handles millions of vectors.

**Q: HNSW vs IVFFlat?**
Both are approximate nearest-neighbour indexes. HNSW: better speed/recall, no training step, more
memory, slower to build. IVFFlat: faster to build, less memory, needs data before building (lists),
lower recall. HNSW is the usual default now.

**Q: Cosine distance vs L2 vs inner product?**
Cosine compares direction (meaning) and ignores length; standard for text embeddings. L2 is
straight-line distance. Inner product equals cosine when vectors are normalised (OpenAI embeddings
are), and is slightly faster.

**Q: What happens if you change the embedding model?**
Vectors from different models are not comparable, and sizes may differ. You need a migration for the
new column size and a full re-embed of all chunks. Store the model name in metadata to detect this.

**Q: Why migrations instead of creating tables manually?**
Reproducible, reviewable, ordered changes that every environment applies the same way, with history
in git and in the database.

**Q: Why cascade delete on chunks?**
So removed articles cannot be retrieved anymore. Stale chunks are a common cause of wrong RAG answers.

## 8. Key takeaways

- RAG storage = documents + chunks + vectors + an ANN index.
- Vector size must match the embedding model.
- Always verify **which** database you are connected to.
- Test with real queries, inside a rolled-back transaction.
