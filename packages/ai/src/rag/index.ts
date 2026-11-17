// RAG pipeline: ingestion (task 3.3), retrieval + grounded answers (task 3.4).
export { chunkDocument, parseDocument } from './chunker';
export type { ChunkOptions, ParsedDocument, TextChunk } from './chunker';
export { ingestKnowledgeBase } from './ingest';
export type { DocumentStatus, IngestReport } from './ingest';
export { retrieve } from './retriever';
export type { RetrievalResult, RetrievedChunk } from './retriever';
export { rerank } from './reranker';
export { answerQuestion } from './answer';
