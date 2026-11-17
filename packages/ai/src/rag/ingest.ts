// Knowledge-base ingestion: files -> chunks -> embeddings -> Postgres (documents + chunks).
//
// Idempotent and incremental:
// - Each document gets a fingerprint = hash(content + embedding model + vector size + chunk settings).
//   Unchanged fingerprint -> skipped (no embedding cost). Changed -> re-chunked and re-embedded.
// - Files that were deleted from the folder are removed from the database (their chunks cascade),
//   so retrieval never returns articles that no longer exist.
// - All new chunks are embedded in as few API calls as possible (batching), which matters on
//   free tiers with low requests-per-minute limits.
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { config } from '@sta/shared';
import { and, chunks, documents, getDb, inArray, like, notInArray } from '@sta/db';
import { getEmbeddingProvider } from '../providers';
import { chunkDocument, parseDocument, type TextChunk } from './chunker';

/** Bump when chunking logic changes, so every document is re-processed once. */
const CHUNKER_VERSION = 'v1';
const SUPPORTED = new Set(['.md', '.markdown', '.txt']);

export type DocumentStatus = 'added' | 'updated' | 'unchanged' | 'removed';

export interface IngestReport {
  documents: { source: string; title: string; status: DocumentStatus; chunks: number }[];
  chunksWritten: number;
  embeddingTokens: number;
  embeddingModel: string;
  durationMs: number;
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const toPosix = (p: string) => p.split('\\').join('/');

/** Knowledge-base files, skipping README.md and files starting with "_" or ".". */
async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => SUPPORTED.has(extname(name).toLowerCase()))
    .filter((name) => name.toLowerCase() !== 'readme.md' && !/^[_.]/.test(name))
    .sort()
    .map((name) => join(dir, name));
}

interface PendingDoc {
  source: string;
  title: string;
  contentHash: string;
  fingerprint: string;
  meta: Record<string, string>;
  chunks: TextChunk[];
  status: 'added' | 'updated';
}

export async function ingestKnowledgeBase(): Promise<IngestReport> {
  const started = Date.now();
  const db = getDb();
  const embedder = getEmbeddingProvider();
  const { chunkSize, chunkOverlap: overlap, knowledgeBaseDir, projectRoot } = config.rag;
  const kbPrefix = toPosix(relative(projectRoot, knowledgeBaseDir));

  // 1. Read files and compute fingerprints.
  const files = await listFiles(knowledgeBaseDir);
  const current = await Promise.all(
    files.map(async (path) => {
      const raw = await readFile(path, 'utf8');
      const source = toPosix(relative(projectRoot, path));
      const contentHash = sha256(raw);
      const fingerprint = sha256(
        [
          contentHash,
          embedder.model,
          embedder.dimensions,
          chunkSize,
          overlap,
          CHUNKER_VERSION,
        ].join('|'),
      );
      return { path, raw, source, contentHash, fingerprint };
    }),
  );

  // 2. Compare with what is already stored.
  const sources = current.map((f) => f.source);
  const stored = sources.length
    ? await db
        .select({ source: documents.source, metadata: documents.metadata })
        .from(documents)
        .where(inArray(documents.source, sources))
    : [];
  const storedFingerprint = new Map(stored.map((d) => [d.source, d.metadata.fingerprint]));

  const report: IngestReport = {
    documents: [],
    chunksWritten: 0,
    embeddingTokens: 0,
    embeddingModel: embedder.model,
    durationMs: 0,
  };

  const pending: PendingDoc[] = [];
  for (const file of current) {
    const previous = storedFingerprint.get(file.source);
    const parsed = parseDocument(file.raw, file.source);
    if (previous === file.fingerprint) {
      report.documents.push({
        source: file.source,
        title: parsed.title,
        status: 'unchanged',
        chunks: 0,
      });
      continue;
    }
    pending.push({
      source: file.source,
      title: parsed.title,
      contentHash: file.contentHash,
      fingerprint: file.fingerprint,
      meta: parsed.meta,
      chunks: chunkDocument(parsed, { chunkSize, overlap }),
      status: previous === undefined ? 'added' : 'updated',
    });
  }

  // 3. Embed all new chunks together (the provider splits them into API-sized batches).
  const texts = pending.flatMap((d) => d.chunks.map((c) => c.content));
  const vectors: number[][] = [];
  if (texts.length) {
    const result = await embedder.embed(texts, { inputType: 'document' });
    vectors.push(...result.vectors);
    report.embeddingTokens = result.usage.inputTokens;
  }

  // 4. Write each document and its chunks in one transaction (all or nothing per document).
  let v = 0;
  for (const doc of pending) {
    const docVectors = vectors.slice(v, v + doc.chunks.length);
    v += doc.chunks.length;
    const metadata = {
      ...doc.meta,
      fingerprint: doc.fingerprint,
      embeddingModel: embedder.model,
      embeddingDimensions: embedder.dimensions,
    };

    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(documents)
        .values({ source: doc.source, title: doc.title, contentHash: doc.contentHash, metadata })
        .onConflictDoUpdate({
          target: documents.source,
          set: { title: doc.title, contentHash: doc.contentHash, metadata, updatedAt: new Date() },
        })
        .returning({ id: documents.id });
      if (!row) throw new Error(`Could not upsert document ${doc.source}`);

      await tx.delete(chunks).where(inArray(chunks.documentId, [row.id]));
      if (doc.chunks.length) {
        await tx.insert(chunks).values(
          doc.chunks.map((c, i) => ({
            documentId: row.id,
            chunkIndex: c.index,
            content: c.content,
            tokenCount: c.tokenEstimate,
            embedding: docVectors[i] ?? [],
            metadata: { heading: c.heading },
          })),
        );
      }
    });

    report.chunksWritten += doc.chunks.length;
    report.documents.push({
      source: doc.source,
      title: doc.title,
      status: doc.status,
      chunks: doc.chunks.length,
    });
  }

  // 5. Remove documents whose file was deleted from the knowledge-base folder.
  const removed = await db
    .delete(documents)
    .where(
      sources.length
        ? and(like(documents.source, `${kbPrefix}/%`), notInArray(documents.source, sources))
        : like(documents.source, `${kbPrefix}/%`),
    )
    .returning({ source: documents.source, title: documents.title });
  for (const r of removed) {
    report.documents.push({ source: r.source, title: r.title, status: 'removed', chunks: 0 });
  }

  report.durationMs = Date.now() - started;
  return report;
}
