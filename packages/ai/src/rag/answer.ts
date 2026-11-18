// Grounded answering (the "G" in RAG):
//   retrieve top-k chunks -> keep relevant ones (distance threshold) -> rerank to top-n
//   -> prompt the chat model with numbered sources -> parse [n] citations.
import { propagateAttributes, startActiveObservation } from '@langfuse/tracing';
import type { ChatResponse, ChatSource } from '@sta/shared';
import { config } from '@sta/shared';
import { getChatProvider } from '../providers';
import {
  ANSWER_PROMPT_VERSION,
  ANSWER_SYSTEM_PROMPT,
  NOT_FOUND_ANSWER,
  buildAnswerUserMessage,
} from '../prompts/answer.prompt';
import { realTraceId, traceLink } from '../tracing';
import { citedIds, normaliseCitations } from './citations';
import { rerank } from './reranker';
import { retrieve } from './retriever';

/**
 * Answer a question from the knowledge base. Traced in Langfuse as one trace ("rag-chat") with a
 * root "chain" observation; retrieval, embedding and the LLM call appear as child observations.
 */
export function answerQuestion(question: string): Promise<ChatResponse> {
  return propagateAttributes(
    {
      traceName: 'rag-chat',
      tags: ['rag', ANSWER_PROMPT_VERSION],
      metadata: { promptVersion: ANSWER_PROMPT_VERSION },
    },
    () =>
      startActiveObservation(
        'rag-answer',
        async (observation): Promise<ChatResponse> => {
          observation.update({ input: { question } });
          try {
            const response = await runAnswer(question);
            observation.update({
              output: {
                answer: response.answer,
                answered: response.answered,
                citations: response.citations.map((c) => `[${c.id}] ${c.title} > ${c.section}`),
              },
              // WARNING makes "not found" answers easy to filter in Langfuse.
              level: response.answered ? 'DEFAULT' : 'WARNING',
              metadata: {
                promptVersion: response.promptVersion,
                sources: response.sources.length,
                llmCalled: response.model !== null,
                timings: response.timings,
              },
            });
            const traceId = realTraceId(observation.traceId);
            return { ...response, traceId, traceUrl: traceLink(traceId) };
          } catch (error) {
            observation.update({
              level: 'ERROR',
              statusMessage: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        },
        { asType: 'chain' },
      ),
  );
}

async function runAnswer(question: string): Promise<Omit<ChatResponse, 'traceId' | 'traceUrl'>> {
  const started = Date.now();

  // 1. Retrieve, then drop chunks that are too far away to be relevant.
  const retrieval = await retrieve(question);
  const relevant = retrieval.chunks.filter((c) => c.distance <= config.rag.maxDistance);
  const top = rerank(relevant);

  const sources: ChatSource[] = top.map((c, i) => ({
    id: i + 1,
    title: c.title,
    section: c.section,
    source: c.source,
    distance: Number(c.distance.toFixed(3)),
    content: c.content,
  }));

  const base = {
    promptVersion: ANSWER_PROMPT_VERSION,
    sources,
    usage: { inputTokens: 0, outputTokens: 0, embeddingTokens: retrieval.embeddingTokens },
  };

  // 2. Nothing relevant: answer "not found" without calling the LLM (no cost, no hallucination).
  if (sources.length === 0) {
    return {
      ...base,
      answer: NOT_FOUND_ANSWER,
      answered: false,
      citations: [],
      model: null,
      timings: { retrievalMs: retrieval.latencyMs, generationMs: 0, totalMs: Date.now() - started },
    };
  }

  // 3. Ask the model to answer from the numbered sources only.
  const result = await getChatProvider().chat({
    tier: 'chat',
    system: ANSWER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildAnswerUserMessage(question, sources) }],
  });

  const answer = normaliseCitations(result.text.trim()) || NOT_FOUND_ANSWER;
  const notFound = answer.includes(NOT_FOUND_ANSWER) || result.refused;
  const ids = notFound ? [] : citedIds(answer, sources.length);

  return {
    ...base,
    answer,
    answered: !notFound,
    citations: sources.filter((s) => ids.includes(s.id)),
    model: result.model,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      embeddingTokens: retrieval.embeddingTokens,
    },
    timings: {
      retrievalMs: retrieval.latencyMs,
      generationMs: result.latencyMs,
      totalMs: Date.now() - started,
    },
  };
}
