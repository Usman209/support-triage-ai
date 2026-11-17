// Central error handler: log the details on the server, return a safe JSON error to the client.
// Never send stack traces, SQL or provider messages to callers (they can leak internals).
import type { ErrorHandler } from 'hono';

/** Errors from LLM/embedding SDKs carry an HTTP `status` from the upstream provider. */
function upstreamStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown })?.status;
  return typeof status === 'number' ? status : undefined;
}

export const errorHandler: ErrorHandler = (error, c) => {
  const status = upstreamStatus(error);
  console.error(`[api] ${c.req.method} ${c.req.path} failed:`, error);

  if (status === 429) {
    return c.json(
      { error: 'rate_limited', message: 'The AI provider is busy. Try again shortly.' },
      503,
    );
  }
  if (status !== undefined || /voyage|embedding/i.test(String(error))) {
    return c.json(
      { error: 'upstream_error', message: 'The AI provider failed. Try again later.' },
      502,
    );
  }
  return c.json({ error: 'internal_error', message: 'Something went wrong.' }, 500);
};
