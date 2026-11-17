// Chat API contract, shared by the API (validation) and the web app (types).
// One definition -> runtime validation (Zod) + TypeScript types (z.infer).
import { z } from 'zod';

export const ChatRequestSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, 'question must not be empty')
    .max(1000, 'question must be at most 1000 characters'),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/** A retrieved knowledge-base chunk, numbered as the model sees it ([1], [2], ...). */
export interface ChatSource {
  id: number;
  title: string;
  section: string;
  /** File the chunk came from, e.g. data/knowledge-base/refund-request.md */
  source: string;
  /** Cosine distance to the question: 0 = same meaning, 1 = unrelated. */
  distance: number;
  /** The chunk text (shown in the UI when a citation is opened). */
  content: string;
}

export interface ChatResponse {
  answer: string;
  /** False when the help centre has no answer (no relevant sources, or the model said so). */
  answered: boolean;
  /** Sources the answer actually cites. */
  citations: ChatSource[];
  /** All sources given to the model. */
  sources: ChatSource[];
  model: string | null;
  promptVersion: string;
  usage: { inputTokens: number; outputTokens: number; embeddingTokens: number };
  timings: { retrievalMs: number; generationMs: number; totalMs: number };
  /** Langfuse trace id for this request (null when tracing is off). Search it in Langfuse. */
  traceId: string | null;
  /** Link to this trace in Langfuse (null when tracing is off or LANGFUSE_PROJECT_ID is unset). */
  traceUrl: string | null;
}
