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

// Small in-memory cache for query embeddings: the same question (common in tests, demos and FAQs)
// doesn't call the embedding API again. Saves latency and free-tier quota. Least-recently-used
// entries are dropped first; the cache is per process and resets on restart.
const QUERY_CACHE_MAX = 500;
const queryCache = new Map<string, number[]>();

async function embedQuery(question: string): Promise<{ vector: number[]; tokens: number }> {
  const embedder = getEmbeddingProvider();
  const key = `${embedder.model}:${embedder.dimensions}:${question.trim().toLowerCase()}`;
  const cached = queryCache.get(key);
  if (cached) {
    queryCache.delete(key); // re-insert to mark as recently used
    queryCache.set(key, cached);
    return { vector: cached, tokens: 0 };
  }
  // Embed the question as a 'query' (documents were embedded as 'document').
  const { vectors, usage } = await embedder.embed([question], { inputType: 'query' });
  const vector = vectors[0] ?? [];
  queryCache.set(key, vector);
  if (queryCache.size > QUERY_CACHE_MAX) {
    const oldest = queryCache.keys().next().value;
    if (oldest !== undefined) queryCache.delete(oldest);
  }
  return { vector, tokens: usage.inputTokens };
}

export async function retrieve(
  question: string,
  topK: number = config.rag.topK,
): Promise<RetrievalResult> {
  const started = Date.now();
  const query = await embedQuery(question);
  const vector = `[${query.vector.join(',')}]`;

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
    embeddingTokens: query.tokens,
    latencyMs: Date.now() - started,
  };
}
