// OpenAI embeddings provider (official OpenAI SDK).
// Anthropic has no embeddings API, so embeddings come from a separate vendor.
import OpenAI from 'openai';
import { config } from '@sta/shared';
import type { EmbeddingProvider, EmbeddingResult } from './types';

/** OpenAI accepts up to 2048 inputs per request; smaller batches keep requests fast and retryable. */
const BATCH_SIZE = 100;

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly model: string;
  readonly dimensions: number;
  private readonly client: OpenAI;

  constructor() {
    if (!config.llm.openaiApiKey) throw new Error('OPENAI_API_KEY is not set in .env');
    if (!config.llm.models.embedding) throw new Error('MODEL_EMBEDDING is not set in .env');
    this.model = config.llm.models.embedding;
    this.dimensions = config.llm.embeddingDimensions;
    this.client = new OpenAI({
      apiKey: config.llm.openaiApiKey,
      timeout: config.llm.timeoutMs,
      maxRetries: config.llm.maxRetries,
    });
  }

  // OpenAI embeddings have no query/document distinction, so EmbedOptions are not needed here.
  async embed(texts: string[]): Promise<EmbeddingResult> {
    const started = Date.now();
    const vectors: number[][] = [];
    let inputTokens = 0;

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE);
      const response = await this.client.embeddings.create({
        model: this.model,
        input: batch,
        dimensions: this.dimensions,
      });
      // Sort by index so vectors line up with the input order.
      const sorted = [...response.data].sort((a, b) => a.index - b.index);
      for (const item of sorted) {
        // Guard: the vector size must match the pgvector column, or inserts will fail later.
        if (item.embedding.length !== this.dimensions) {
          throw new Error(
            `Embedding has ${item.embedding.length} dimensions, expected ${this.dimensions} (EMBEDDING_DIMENSIONS)`,
          );
        }
        vectors.push(item.embedding);
      }
      inputTokens += response.usage.prompt_tokens;
    }

    return { vectors, model: this.model, usage: { inputTokens }, latencyMs: Date.now() - started };
  }
}
