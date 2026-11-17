// RAG pipeline: ingestion now (task 3.3); retrieval + reranking next (task 3.4).
export { chunkDocument, parseDocument } from './chunker';
export type { ChunkOptions, ParsedDocument, TextChunk } from './chunker';
export { ingestKnowledgeBase } from './ingest';
export type { DocumentStatus, IngestReport } from './ingest';
