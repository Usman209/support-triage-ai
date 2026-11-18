// Approvals contract (task 4.4/4.5): payload rules per action type, request bodies, list items.
// Payloads are validated when the agent proposes AND again when a human approves (the human may
// have edited them).
import { z } from 'zod';
import { ESCALATION_TEAMS, TICKET_CATEGORIES, TICKET_PRIORITIES } from './triage';

export const ACTION_TYPES = [
  'set_category',
  'set_priority',
  'draft_reply',
  'add_internal_note',
  'escalate',
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const ACTION_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'expired',
  'executed',
  'failed',
] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

const citation = z.object({
  id: z.number().int(),
  title: z.string(),
  section: z.string(),
  source: z.string(),
});

/** What each action type's payload must look like. */
export const ActionPayloadSchemas = {
  set_category: z.object({ category: z.enum(TICKET_CATEGORIES) }).strict(),
  set_priority: z.object({ priority: z.enum(TICKET_PRIORITIES) }).strict(),
  draft_reply: z
    .object({
      reply: z.string().trim().min(10).max(2000),
      citations: z.array(citation).default([]),
    })
    .strict(),
  add_internal_note: z.object({ note: z.string().trim().min(3).max(600) }).strict(),
  escalate: z.object({ team: z.enum(ESCALATION_TEAMS) }).strict(),
} satisfies Record<ActionType, z.ZodType>;

export const ApproveRequestSchema = z.object({
  /** Who decides. No login yet (task 8 adds OIDC), so the UI sends a name. */
  reviewer: z.string().trim().min(1).max(80).default('anonymous'),
  note: z.string().trim().max(500).optional(),
  /** Optional edited payload ("edit & approve"). Validated against the action type. */
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type ApproveRequest = z.infer<typeof ApproveRequestSchema>;

export const RejectRequestSchema = z.object({
  reviewer: z.string().trim().min(1).max(80).default('anonymous'),
  note: z.string().trim().max(500).optional(),
});
export type RejectRequest = z.infer<typeof RejectRequestSchema>;

/** One proposed action as shown in the approvals list. */
export interface ApprovalItem {
  id: string;
  type: ActionType;
  status: ActionStatus;
  payload: Record<string, unknown>;
  rationale: string;
  createdAt: string;
  expiresAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  result: Record<string, unknown> | null;
  ticket: {
    id: string;
    externalId: string;
    subject: string;
    product: string | null;
    description: string;
    category: string | null;
    priority: string | null;
  };
  run: {
    id: string;
    model: string | null;
    promptVersion: string | null;
    summary: string | null;
    confidence: string | null;
    traceUrl: string | null;
  };
}

export interface ApprovalsListResponse {
  items: ApprovalItem[];
  counts: Record<ActionStatus, number>;
}

export interface DecisionResponse {
  item: ApprovalItem;
  /** The ticket after execution (approve) — shows what changed. */
  ticket?: ApprovalItem['ticket'];
}
