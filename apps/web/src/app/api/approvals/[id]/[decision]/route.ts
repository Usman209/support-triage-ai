// POST /api/approvals/:id/approve | /api/approvals/:id/reject -> API
import { proxyToApi } from '@/lib/api-proxy';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; decision: string }> },
): Promise<Response> {
  const { id, decision } = await params;
  if (decision !== 'approve' && decision !== 'reject') {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
  return proxyToApi(`/approvals/${encodeURIComponent(id)}/${decision}`, {
    method: 'POST',
    body: await request.text(),
  });
}
