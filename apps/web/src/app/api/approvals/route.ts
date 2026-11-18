// GET /api/approvals?status=... -> API GET /approvals
import { proxyToApi } from '@/lib/api-proxy';

export async function GET(request: Request): Promise<Response> {
  const { search } = new URL(request.url);
  return proxyToApi(`/approvals${search}`);
}
