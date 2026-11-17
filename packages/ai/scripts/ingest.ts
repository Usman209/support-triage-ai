// Ingest the knowledge base into Postgres (documents + chunks with embeddings).
// Safe to run many times: unchanged files are skipped, deleted files are removed.
// Usage: pnpm ingest
import { closeDb } from '@sta/db';
import { ingestKnowledgeBase } from '../src/index';

async function main() {
  const report = await ingestKnowledgeBase();
  console.table(
    report.documents.map((d) => ({ status: d.status, chunks: d.chunks, title: d.title })),
  );
  const count = (s: string) => report.documents.filter((d) => d.status === s).length;
  console.log(
    `added ${count('added')}, updated ${count('updated')}, unchanged ${count('unchanged')}, ` +
      `removed ${count('removed')} | chunks written ${report.chunksWritten} | ` +
      `embedding tokens ${report.embeddingTokens} (${report.embeddingModel}) | ${report.durationMs} ms`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
