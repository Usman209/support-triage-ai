// Approval routes (task 4.4).
//   GET  /approvals?status=pending|executed|rejected|expired|failed|approved|all
//   POST /approvals/:id/approve   { reviewer, note?, payload? }   payload = edited version
//   POST /approvals/:id/reject    { reviewer, note? }
import { Hono, type Context } from 'hono';
import {
  ACTION_STATUSES,
  ApproveRequestSchema,
  RejectRequestSchema,
  type ActionStatus,
} from '@sta/shared';
import {
  ApprovalError,
  approveAction,
  listApprovals,
  rejectAction,
} from '../services/approval.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function handle(c: Context, error: unknown) {
  if (error instanceof ApprovalError) {
    return c.json({ error: error.code, message: error.message }, error.status);
  }
  throw error; // central error handler
}

async function body(c: Context): Promise<unknown> {
  return c.req.json().catch(() => ({}));
}

export const approvalRoutes = new Hono()
  .get('/', async (c) => {
    const status = (c.req.query('status') ?? 'pending') as ActionStatus | 'all';
    if (status !== 'all' && !ACTION_STATUSES.includes(status)) {
      return c.json({ error: 'invalid_request', message: `Unknown status "${status}"` }, 400);
    }
    const limit = Math.min(Number(c.req.query('limit') ?? 100) || 100, 300);
    return c.json(await listApprovals(status, limit));
  })
  .post('/:id/approve', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return c.json({ error: 'invalid_request', message: 'Invalid id' }, 400);
    const parsed = ApproveRequestSchema.safeParse(await body(c));
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', message: parsed.error.issues[0]?.message }, 400);
    }
    try {
      return c.json(await approveAction(id, parsed.data));
    } catch (error) {
      return handle(c, error);
    }
  })
  .post('/:id/reject', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return c.json({ error: 'invalid_request', message: 'Invalid id' }, 400);
    const parsed = RejectRequestSchema.safeParse(await body(c));
    if (!parsed.success) {
      return c.json({ error: 'invalid_request', message: parsed.error.issues[0]?.message }, 400);
    }
    try {
      return c.json(await rejectAction(id, parsed.data));
    } catch (error) {
      return handle(c, error);
    }
  });
