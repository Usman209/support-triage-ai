// Provider-neutral interfaces. The rest of the app (RAG, agent, API) talks to these, never to a
// vendor SDK directly, so a vendor can be swapped by changing .env, and tests can use a fake.

/** Which configured model to use: MODEL_CHAT, MODEL_CHEAP or MODEL_JUDGE. */
export type ModelTier = 'chat' | 'cheap' | 'judge';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  /** Instructions for the model (who it is, rules, output format). */
  system?: string;
  messages: ChatMessage[];
  /** Defaults to 'chat'. */
  tier?: ModelTier;
  /** Defaults to LLM_EFFORT. */
  effort?: Effort;
  /** Defaults to LLM_MAX_OUTPUT_TOKENS. */
  maxOutputTokens?: number;
}

export interface ChatResult {
  text: string;
  /** The model that actually answered (can differ from the requested one after a refusal fallback). */
  model: string;
  stopReason: string | null;
  /** True when the model (and any fallback) declined for safety reasons. */
  refused: boolean;
  /** True when a fallback model answered instead of the requested one. */
  usedFallback: boolean;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
}

export interface ChatProvider {
  readonly name: string;
  chat(request: ChatRequest): Promise<ChatResult>;
}

export interface EmbeddingResult {
  /** One vector per input text, in the same order. */
  vectors: number[][];
  model: string;
  usage: { inputTokens: number };
  latencyMs: number;
}

export interface EmbedOptions {
  /**
   * 'document' when indexing knowledge-base chunks, 'query' when embedding a user question.
   * Some models (Voyage) add a retrieval hint per type, which improves search quality.
   */
  inputType?: 'document' | 'query';
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[], options?: EmbedOptions): Promise<EmbeddingResult>;
}
