// Reranker: re-order retrieved chunks by relevance and keep the best RAG_RERANK_TOP_N.
// RAG_RERANKER=none keeps the vector-search order (good enough for a small knowledge base).
// TODO (later): 'cohere' (hosted cross-encoder) or 'local' (e.g. a small cross-encoder model),
// worth it when the knowledge base grows and top-k results get noisy.
import { config } from '@sta/shared';
import type { RetrievedChunk } from './retriever';

export function rerank(
  chunks: RetrievedChunk[],
  topN: number = config.rag.rerankTopN,
): RetrievedChunk[] {
  switch (config.rag.reranker) {
    case 'none':
      return chunks.slice(0, topN);
    case 'cohere':
    case 'local':
      throw new Error(`RAG_RERANKER="${config.rag.reranker}" is not implemented yet; use "none"`);
  }
}
