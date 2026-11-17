// LLM provider smoke test. Makes REAL API calls (well under 1 cent):
//   1. embeds 4 sentences and shows which ones are similar (cosine similarity)
//   2. asks the chat model to triage one sample ticket
// Usage: pnpm ai:smoke
import { getChatProvider, getEmbeddingProvider } from '../src/index';

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function testEmbeddings() {
  const embedder = getEmbeddingProvider();
  // Like real RAG: the user's question is a 'query', knowledge-base texts are 'document's.
  const question = 'I forgot my password';
  const documents = [
    'How do I reset my password?',
    'I want a refund for my order',
    'The weather is nice today',
  ];
  const q = await embedder.embed([question], { inputType: 'query' });
  const d = await embedder.embed(documents, { inputType: 'document' });
  console.log(
    `\n[embeddings] ${embedder.name} ${d.model}: ${d.vectors[0]?.length} dims, ` +
      `${q.usage.inputTokens + d.usage.inputTokens} tokens, ${q.latencyMs + d.latencyMs} ms`,
  );
  const queryVector = q.vectors[0] ?? [];
  console.log(`question: "${question}"`);
  console.table(
    documents.map((text, i) => ({
      document: text,
      similarity: Number(cosineSimilarity(queryVector, d.vectors[i] ?? []).toFixed(3)),
    })),
  );
}

async function testChat() {
  const chat = getChatProvider();
  const result = await chat.chat({
    system:
      'You triage customer support tickets. Reply with exactly three lines: ' +
      'category: <account|billing|technical|other>, priority: <low|medium|high>, reason: <one short sentence>.',
    messages: [
      {
        role: 'user',
        content:
          'Ticket: "I was charged twice for my subscription this month, please fix it ASAP."',
      },
    ],
  });
  console.log(`\n[chat] ${chat.name} ${result.model}`);
  console.log(result.text);
  console.log({
    stopReason: result.stopReason,
    refused: result.refused,
    usedFallback: result.usedFallback,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    latencyMs: result.latencyMs,
  });
}

/** Run each test on its own, so one failing provider doesn't hide the other's result. */
async function run(name: string, test: () => Promise<void>): Promise<boolean> {
  try {
    await test();
    return true;
  } catch (error) {
    const e = error as { status?: number; code?: string; message?: string };
    console.error(`\n[${name}] FAILED: ${e.status ?? ''} ${e.code ?? ''} ${e.message ?? error}`);
    return false;
  }
}

async function main() {
  const results = [await run('embeddings', testEmbeddings), await run('chat', testChat)];
  if (results.includes(false)) process.exitCode = 1;
}

void main();
