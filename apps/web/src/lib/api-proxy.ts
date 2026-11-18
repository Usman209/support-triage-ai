// Server-side helper for Next.js route handlers: forward a request to the Hono API.
// The browser only talks to its own origin; the API address stays on the server.
import { config } from '@sta/shared';

export async function proxyToApi(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    const upstream = await fetch(`${config.app.apiUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      // LLM calls (triage) can take a while; give the API time to answer or time out itself.
      signal: AbortSignal.timeout(config.llm.timeoutMs * 2 + 15_000),
      cache: 'no-store',
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return Response.json(
      { error: 'api_unreachable', message: 'The API is not reachable. Is `pnpm dev:api` running?' },
      { status: 502 },
    );
  }
}
