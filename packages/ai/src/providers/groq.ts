// Groq chat provider. Groq runs open models (Llama, gpt-oss) very fast and has a free tier.
// Its API is OpenAI-compatible, so we use the official OpenAI SDK with Groq's base URL.
import OpenAI from 'openai';
import { config } from '@sta/shared';
import type { ChatProvider, ChatRequest, ChatResult, ModelTier } from './types';

function modelFor(tier: ModelTier): string {
  const model = config.llm.models[tier];
  if (!model) throw new Error(`MODEL_${tier.toUpperCase()} is not set in .env`);
  return model;
}

export class GroqChatProvider implements ChatProvider {
  readonly name = 'groq';
  private readonly client: OpenAI;

  constructor() {
    if (!config.llm.groqApiKey) throw new Error('GROQ_API_KEY is not set in .env');
    if (!config.llm.groqBaseUrl) throw new Error('GROQ_BASE_URL is not set in .env');
    this.client = new OpenAI({
      apiKey: config.llm.groqApiKey,
      baseURL: config.llm.groqBaseUrl,
      timeout: config.llm.timeoutMs,
      maxRetries: config.llm.maxRetries,
    });
  }

  async chat(request: ChatRequest): Promise<ChatResult> {
    const model = modelFor(request.tier ?? 'chat');
    const started = Date.now();

    // OpenAI-style APIs put the system prompt in the messages list (Claude has a separate field).
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      ...(request.system ? [{ role: 'system' as const, content: request.system }] : []),
      ...request.messages,
    ];

    const response = await this.client.chat.completions.create({
      model,
      messages,
      max_completion_tokens: request.maxOutputTokens ?? config.llm.maxOutputTokens,
      // Open models still use temperature (Claude uses `effort` instead).
      temperature: config.llm.temperature,
    });

    const choice = response.choices[0];
    return {
      text: choice?.message.content ?? '',
      model: response.model,
      stopReason: choice?.finish_reason ?? null,
      refused: choice?.finish_reason === 'content_filter',
      usedFallback: false,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
      latencyMs: Date.now() - started,
    };
  }
}
