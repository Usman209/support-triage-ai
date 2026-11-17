// Tracing decorators: wrap any ChatProvider / EmbeddingProvider so every call is recorded as a
// Langfuse observation (model, input, output, tokens, latency, errors). Callers don't change.
// If no tracer is registered (scripts, tests), the observations are no-ops.
import { startActiveObservation } from '@langfuse/tracing';
import { config } from '@sta/shared';
import type {
  ChatProvider,
  ChatRequest,
  ChatResult,
  EmbeddingProvider,
  EmbeddingResult,
  EmbedOptions,
} from './types';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function tracedChatProvider(inner: ChatProvider): ChatProvider {
  return {
    name: inner.name,
    chat: (request: ChatRequest) =>
      startActiveObservation(
        `llm.${inner.name}`,
        async (generation): Promise<ChatResult> => {
          generation.update({
            input: [
              ...(request.system ? [{ role: 'system', content: request.system }] : []),
              ...request.messages,
            ],
            modelParameters: {
              tier: request.tier ?? 'chat',
              maxOutputTokens: request.maxOutputTokens ?? config.llm.maxOutputTokens,
              ...(inner.name === 'anthropic'
                ? { effort: request.effort ?? config.llm.effort }
                : { temperature: config.llm.temperature }),
            },
          });
          try {
            const result = await inner.chat(request);
            generation.update({
              model: result.model,
              output: result.text,
              usageDetails: { input: result.usage.inputTokens, output: result.usage.outputTokens },
              metadata: {
                stopReason: result.stopReason,
                refused: result.refused,
                usedFallback: result.usedFallback,
                latencyMs: result.latencyMs,
              },
            });
            return result;
          } catch (error) {
            generation.update({ level: 'ERROR', statusMessage: errorText(error) });
            throw error;
          }
        },
        { asType: 'generation' },
      ),
  };
}

export function tracedEmbeddingProvider(inner: EmbeddingProvider): EmbeddingProvider {
  return {
    name: inner.name,
    model: inner.model,
    dimensions: inner.dimensions,
    embed: (texts: string[], options?: EmbedOptions) =>
      startActiveObservation(
        `embed.${inner.name}`,
        async (embedding): Promise<EmbeddingResult> => {
          embedding.update({
            model: inner.model,
            // Short inputs (queries) are logged as text; big batches (ingestion) only as a count.
            input: texts.length <= 3 ? texts : `${texts.length} texts`,
            modelParameters: {
              dimensions: inner.dimensions,
              inputType: options?.inputType ?? 'none',
            },
          });
          try {
            const result = await inner.embed(texts, options);
            embedding.update({
              output: `${result.vectors.length} vectors x ${inner.dimensions} dims`,
              usageDetails: { input: result.usage.inputTokens },
              metadata: { latencyMs: result.latencyMs },
            });
            return result;
          } catch (error) {
            embedding.update({ level: 'ERROR', statusMessage: errorText(error) });
            throw error;
          }
        },
        { asType: 'embedding' },
      ),
  };
}
