// Knowledge-base tables for RAG (task 3).
//
//   documents  one row per help-centre article (the source file)
//   chunks     small pieces of each document, each with an embedding vector
//
// The vector size comes from EMBEDDING_DIMENSIONS in .env. It must match the embedding model
// (text-embedding-3-small = 1536). Changing the model means a new migration and a re-ingest.
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';
import { config } from '@sta/shared';

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Where the document came from, e.g. "data/knowledge-base/reset-password.md". Unique, so
  // re-running ingestion updates the same row instead of creating duplicates.
  source: text('source').notNull().unique(),
  title: text('title').notNull(),
  // SHA-256 of the file content. If it has not changed, ingestion can skip re-embedding (saves money).
  contentHash: text('content_hash').notNull(),
  // Free-form extra info: url, product, language, ...
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chunks = pgTable(
  'chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Deleting a document deletes its chunks too (cascade).
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    // Position of the chunk inside the document: 0, 1, 2, ...
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    tokenCount: integer('token_count'),
    embedding: vector('embedding', { dimensions: config.llm.embeddingDimensions }).notNull(),
    // e.g. the heading the chunk is under, so answers can cite "Reset password > Step 2".
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One chunk per position per document.
    uniqueIndex('chunks_document_chunk_idx').on(t.documentId, t.chunkIndex),
    // HNSW = fast approximate nearest-neighbour search. vector_cosine_ops = cosine distance (<=>),
    // the usual choice for text embeddings.
    index('chunks_embedding_hnsw_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  ],
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
