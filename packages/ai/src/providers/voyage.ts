// Voyage AI embeddings provider (REST API via fetch; no SDK needed for one endpoint).
// Voyage is the embeddings vendor Anthropic recommends, and has a free token allowance.
// API: POST {VOYAGE_BASE_URL}/embeddings   (docs.voyageai.com/reference/embeddings-api)
import { config } from '@sta/shared';
import type { EmbeddingProvider, EmbeddingResult, EmbedOptions } from './types';

/** Voyage allows up to 1000 inputs per request; 128 keeps each request small and fast. */
const BATCH_SIZE = 128;

interface VoyageResponse {
  data: { embedding: number[]; index: number }[];
  model: string;
  usage: { total_tokens: number };
}

/** Errors worth retrying: rate limit, server errors. 4xx like 400/401 will not fix themselves. */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'voyage';
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor() {
    if (!config.llm.voyageApiKey) throw new Error('VOYAGE_API_KEY is not set in .env');
    if (!config.llm.voyageBaseUrl) throw new Error('VOYAGE_BASE_URL is not set in .env');
    if (!config.llm.models.embedding) throw new Error('MODEL_EMBEDDING is not set in .env');
    this.apiKey = config.llm.voyageApiKey;
    this.baseUrl = config.llm.voyageBaseUrl.replace(/\/$/, '');
    this.model = config.llm.models.embedding;
    this.dimensions = config.llm.embeddingDimensions;
  }

  async embed(texts: string[], options: EmbedOptions = {}): Promise<EmbeddingResult> {
    const started = Date.now();
    const vectors: number[][] = [];
    let inputTokens = 0;

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const response = await this.request({
        input: texts.slice(i, i + BATCH_SIZE),
        model: this.model,
        input_type: options.inputType ?? null,
        output_dimension: this.dimensions,
      });
      const sorted = [...response.data].sort((a, b) => a.index - b.index);
      for (const item of sorted) {
        if (item.embedding.length !== this.dimensions) {
          throw new Error(
            `Embedding has ${item.embedding.length} dimensions, expected ${this.dimensions} (EMBEDDING_DIMENSIONS)`,
          );
        }
        vectors.push(item.embedding);
      }
      inputTokens += response.usage.total_tokens;
    }

    return { vectors, model: this.model, usage: { inputTokens }, latencyMs: Date.now() - started };
  }

  /** POST with timeout and retries (exponential backoff), like the official SDKs do. */
  private async request(body: Record<string, unknown>): Promise<VoyageResponse> {
    for (let attempt = 0; ; attempt++) {
      let status = 0;
      let detail = '';
      try {
        const res = await fetch(`${this.baseUrl}/embeddings`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(config.llm.timeoutMs),
        });
        if (res.ok) return (await res.json()) as VoyageResponse;
        status = res.status;
        detail = await res.text();
      } catch (error) {
        // Network error or timeout: treat like a server error (retryable).
        status = 0;
        detail = error instanceof Error ? error.message : String(error);
      }

      const retryable = status === 0 || isRetryable(status);
      if (!retryable || attempt >= config.llm.maxRetries) {
        throw new Error(`Voyage embeddings failed (status ${status || 'network'}): ${detail}`);
      }
      await sleep(500 * 2 ** attempt); // 0.5s, 1s, 2s, ...
    }
  }
}
