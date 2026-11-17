// Retriever: question -> query embedding -> nearest chunks in Postgres (pgvector).
import { config } from '@sta/shared';
import { getDb, sql } from '@sta/db';
import { getEmbeddingProvider } from '../providers';

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  source: string;
  title: string;
  section: string;
  content: string;
  /** Cosine distance (0 = same meaning, 1 = unrelated, 2 = opposite). */
  distance: number;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  embeddingTokens: number;
  latencyMs: number;
}

export async function retrieve(
  question: string,
  topK: number = config.rag.topK,
): Promise<RetrievalResult> {
  const started = Date.now();
  // Embed the question as a 'query' (documents were embedded as 'document').
  const { vectors, usage } = await getEmbeddingProvider().embed([question], { inputType: 'query' });
  const vector = `[${(vectors[0] ?? []).join(',')}]`;

  // ORDER BY the distance operator so Postgres can use the HNSW index.
  const rows = await getDb().execute<{
    chunk_id: string;
    document_id: string;
    source: string;
    title: string;
    section: string | null;
    content: string;
    distance: number;
  }>(sql`
    select c.id as chunk_id, d.id as document_id, d.source, d.title,
           c.metadata->>'heading' as section, c.content,
           (c.embedding <=> ${vector}::vector) as distance
    from chunks c
    join documents d on d.id = c.document_id
    order by c.embedding <=> ${vector}::vector
    limit ${topK}`);

  return {
    chunks: rows.map((r) => ({
      chunkId: r.chunk_id,
      documentId: r.document_id,
      source: r.source,
      title: r.title,
      section: r.section ?? r.title,
      content: r.content,
      distance: Number(r.distance),
    })),
    embeddingTokens: usage.inputTokens,
    latencyMs: Date.now() - started,
  };
}
