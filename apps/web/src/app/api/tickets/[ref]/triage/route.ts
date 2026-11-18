// POST /api/tickets/:ref/triage -> API (runs the triage agent, creates pending proposals)
import { proxyToApi } from '@/lib/api-proxy';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ ref: string }> },
): Promise<Response> {
  const { ref } = await params;
  return proxyToApi(`/tickets/${encodeURIComponent(ref)}/triage`, { method: 'POST' });
}
