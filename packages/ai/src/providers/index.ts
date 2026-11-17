// Provider factory: picks the implementation from .env (LLM_PROVIDER, EMBEDDING_PROVIDER).
// Callers use getChatProvider() / getEmbeddingProvider() and never import a vendor SDK.
// Every provider is wrapped with a tracing decorator (see traced.ts).
import { config } from '@sta/shared';
import { AnthropicChatProvider } from './anthropic';
import { GroqChatProvider } from './groq';
import { OpenAIEmbeddingProvider } from './openai';
import { tracedChatProvider, tracedEmbeddingProvider } from './traced';
import { VoyageEmbeddingProvider } from './voyage';
import type { ChatProvider, EmbeddingProvider } from './types';

let chatProvider: ChatProvider | undefined;
let embeddingProvider: EmbeddingProvider | undefined;

export function getChatProvider(): ChatProvider {
  if (chatProvider) return chatProvider;
  switch (config.llm.provider) {
    case 'anthropic':
      chatProvider = tracedChatProvider(new AnthropicChatProvider());
      return chatProvider;
    case 'groq':
      chatProvider = tracedChatProvider(new GroqChatProvider());
      return chatProvider;
    case 'openai':
    case 'ollama':
      throw new Error(`Chat provider "${config.llm.provider}" is not implemented yet`);
  }
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (embeddingProvider) return embeddingProvider;
  switch (config.llm.embeddingProvider) {
    case 'voyage':
      embeddingProvider = tracedEmbeddingProvider(new VoyageEmbeddingProvider());
      return embeddingProvider;
    case 'openai':
      embeddingProvider = tracedEmbeddingProvider(new OpenAIEmbeddingProvider());
      return embeddingProvider;
    case 'ollama':
      throw new Error('Embedding provider "ollama" is not implemented yet');
  }
}

export type * from './types';
