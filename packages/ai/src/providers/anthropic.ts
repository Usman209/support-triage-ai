// Claude chat provider (official Anthropic SDK).
//
// Notes for current Claude models (Sonnet 5.5 / Haiku 5.5 / Opus 5.5):
// - Adaptive thinking is on by default; thinking tokens count toward max_tokens.
// - `temperature` is rejected (400), so we never send it. Depth/cost is set with `effort`.
// - On a safety refusal, the API can re-run the request on a fallback model when we send
//   `fallbacks: 'default'` (beta). Claude Haiku has no server-side fallback, so we skip it there.
import Anthropic from '@anthropic-ai/sdk';
import { config } from '@sta/shared';
import type { ChatProvider, ChatRequest, ChatResult, ModelTier } from './types';

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

function modelFor(tier: ModelTier): string {
  const model = config.llm.models[tier];
  if (!model) throw new Error(`MODEL_${tier.toUpperCase()} is not set in .env`);
  return model;
}

function supportsServerFallback(model: string): boolean {
  return !model.startsWith('claude-haiku');
}

export class AnthropicChatProvider implements ChatProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor() {
    if (!config.llm.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY is not set in .env');
    this.client = new Anthropic({
      apiKey: config.llm.anthropicApiKey,
      timeout: config.llm.timeoutMs, // milliseconds in the TypeScript SDK
      maxRetries: config.llm.maxRetries, // retries 408/409/429/5xx and connection errors
    });
  }

  async chat(request: ChatRequest): Promise<ChatResult> {
    const model = modelFor(request.tier ?? 'chat');
    const useFallback = config.llm.refusalFallback === 'default' && supportsServerFallback(model);
    const started = Date.now();

    const response = await this.client.beta.messages.create({
      model,
      max_tokens: request.maxOutputTokens ?? config.llm.maxOutputTokens,
      ...(request.system ? { system: request.system } : {}),
      messages: request.messages,
      output_config: { effort: request.effort ?? config.llm.effort },
      ...(useFallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
    });

    // The answer is the text blocks; thinking blocks (empty by default) are not part of it.
    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    const usedFallback = (response.usage.iterations ?? []).some(
      (entry) => entry.type === 'fallback_message',
    );

    return {
      text,
      model: response.model,
      stopReason: response.stop_reason,
      refused: response.stop_reason === 'refusal',
      usedFallback,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      latencyMs: Date.now() - started,
    };
  }
}
