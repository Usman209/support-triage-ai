// Server-side proxy: browser -> Next.js (/api/chat) -> Hono API (/chat).
// Why: the browser talks only to its own origin (no CORS setup), and the API address
// (config.app.apiUrl) stays on the server.
import { config } from '@sta/shared';

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  try {
    const upstream = await fetch(`${config.app.apiUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      // A little longer than one LLM call, so the API can return its own timeout error first.
      signal: AbortSignal.timeout(config.llm.timeoutMs + 15_000),
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
