// Retrieval check (a tiny retrieval eval): for ticket-style questions, does vector search return
// the article that should answer them?  hit@1 = right article ranked first, hit@3 = in the top 3.
// Makes 1 embedding call (all questions in one batch). Usage: pnpm kb:check
import { closeDb, getDb, sql } from '@sta/db';
import { getEmbeddingProvider } from '../src/index';

// Ticket-style questions written for this check (no customer data), with the expected article.
const CASES: { question: string; expected: string }[] = [
  {
    question: 'I keep getting locked out after entering my password',
    expected: 'account-access.md',
  },
  { question: 'My GoPro battery dies after 20 minutes of recording', expected: 'battery-life.md' },
  { question: 'How do I stop my monthly subscription?', expected: 'cancellation-request.md' },
  { question: 'All my photos disappeared from the memory card', expected: 'data-loss.md' },
  {
    question: 'Tracking says delivered but the parcel is not here',
    expected: 'delivery-problem.md',
  },
  { question: 'There are vertical lines on my LG TV screen', expected: 'display-issue.md' },
  { question: 'My robot vacuum makes a loud grinding noise', expected: 'hardware-issue.md' },
  {
    question: 'Which wires do I connect for the Nest thermostat?',
    expected: 'installation-support.md',
  },
  { question: 'Philips Hue bulbs will not join my 5 GHz Wi-Fi', expected: 'network-problem.md' },
  { question: 'I was charged twice for the same order', expected: 'payment-issue.md' },
  {
    question: 'My Bluetooth headphones will not pair with the tablet',
    expected: 'peripheral-compatibility.md',
  },
  { question: 'Does this smart plug work with Apple Home?', expected: 'product-compatibility.md' },
  {
    question: 'Which camera should a beginner buy for travel photos?',
    expected: 'product-recommendation.md',
  },
  { question: 'How do I set up my new Amazon Echo?', expected: 'product-setup.md' },
  { question: 'I want my money back for headphones I opened', expected: 'refund-request.md' },
  {
    question: 'The app crashes every time I open it after the update',
    expected: 'software-bug.md',
  },
];

const TOP_K = 3;

async function main() {
  const embedder = getEmbeddingProvider();
  const db = getDb();
  const { vectors, usage } = await embedder.embed(
    CASES.map((c) => c.question),
    { inputType: 'query' },
  );

  let hit1 = 0;
  let hit3 = 0;
  const rows = [];
  for (const [i, c] of CASES.entries()) {
    const vector = `[${(vectors[i] ?? []).join(',')}]`;
    // Nearest chunks by cosine distance (<=>). Uses the HNSW index on large tables.
    const results = await db.execute<{ source: string; heading: string; distance: number }>(sql`
      select d.source, c.metadata->>'heading' as heading,
             (c.embedding <=> ${vector}::vector) as distance
      from chunks c join documents d on d.id = c.document_id
      order by c.embedding <=> ${vector}::vector
      limit ${TOP_K}`);
    const files = results.map((r) => r.source.split('/').pop());
    const top = results[0];
    if (files[0] === c.expected) hit1++;
    if (files.includes(c.expected)) hit3++;
    rows.push({
      question: c.question.slice(0, 48),
      expected: c.expected.replace('.md', ''),
      top1: `${files[0]?.replace('.md', '')} > ${top?.heading ?? ''}`.slice(0, 50),
      distance: Number(Number(top?.distance ?? 0).toFixed(3)),
      result: files[0] === c.expected ? 'hit@1' : files.includes(c.expected) ? 'hit@3' : 'MISS',
    });
  }

  console.table(rows);
  console.log(
    `hit@1 ${hit1}/${CASES.length} (${Math.round((100 * hit1) / CASES.length)}%) | ` +
      `hit@3 ${hit3}/${CASES.length} (${Math.round((100 * hit3) / CASES.length)}%) | ` +
      `${usage.inputTokens} query tokens (${embedder.model})`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
