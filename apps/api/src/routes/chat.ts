// POST /chat  { "question": "..." }  ->  grounded answer with citations (ChatResponse).
import { Hono } from 'hono';
import { answerQuestion } from '@sta/ai';
import { ChatRequestSchema } from '@sta/shared';

export const chatRoutes = new Hono().post('/', async (c) => {
  // Validate input at the boundary: never pass unchecked data to the LLM layer.
  const body: unknown = await c.req.json().catch(() => null);
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'invalid_request',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      400,
    );
  }

  const result = await answerQuestion(parsed.data.question);
  return c.json(result);
});
