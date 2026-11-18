// Database smoke test: checks connection, pgvector, the RAG tables, vector search and cascade
// delete. Everything runs inside a transaction that is rolled back, so no data is kept.
// Usage: pnpm db:smoke
import { sql } from 'drizzle-orm';
import { config } from '@sta/shared';
import { chunks, closeDb, documents, getDb } from '../src/index';

class Rollback extends Error {}

const db = getDb();
const dims = config.llm.embeddingDimensions; // from .env, same as the vector column
const vec = (fill: (i: number) => number) => Array.from({ length: dims }, (_, i) => fill(i));

async function main() {
  const info = await db.execute(
    sql`select current_database() as db,
        (select extversion from pg_extension where extname = 'vector') as pgvector`,
  );
  console.log('connected:', info[0]);

  try {
    await db.transaction(async (tx) => {
      const [doc] = await tx
        .insert(documents)
        .values({ source: 'test/smoke.md', title: 'Smoke test', contentHash: 'x' })
        .returning();
      if (!doc) throw new Error('insert failed');

      await tx.insert(chunks).values([
        {
          documentId: doc.id,
          chunkIndex: 0,
          content: 'How to reset your password',
          embedding: vec(() => 1),
        },
        {
          documentId: doc.id,
          chunkIndex: 1,
          content: 'Refund policy for orders',
          embedding: vec((i) => (i < dims / 2 ? 1 : -1)),
        },
        {
          documentId: doc.id,
          chunkIndex: 2,
          content: 'Change your email address',
          embedding: vec((i) => (i < dims * 0.8 ? 1 : 0)),
        },
      ]);

      // Query vector = same direction as chunk 0. Cosine distance: 0 = same meaning, 2 = opposite.
      const query = `[${vec(() => 1).join(',')}]`;
      const rows = await tx.execute(sql`
        select chunk_index, content,
               round((embedding <=> ${query}::vector)::numeric, 3) as cosine_distance
        from chunks
        order by embedding <=> ${query}::vector
        limit 3`);
      console.log('nearest chunks:');
      console.table(rows);

      await tx.delete(documents).where(sql`${documents.source} = 'test/smoke.md'`);
      // Count only THIS document's chunks: the real knowledge base has its own chunks too.
      const left = await tx.execute(
        sql`select count(*)::int as n from chunks where document_id = ${doc.id}`,
      );
      console.log('test chunks left after deleting the document (cascade):', left[0]?.n);

      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
    console.log('rolled back: no test data kept');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
