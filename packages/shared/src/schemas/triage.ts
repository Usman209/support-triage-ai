// Triage contract (task 4.3): what the LLM must return, validated at runtime with Zod.
// The model only SUGGESTS values; code turns them into pending proposed actions.
import { z } from 'zod';

export const TICKET_CATEGORIES = [
  'refund_request',
  'technical_issue',
  'cancellation_request',
  'product_inquiry',
  'billing_inquiry',
] as const;
export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export const ESCALATION_TEAMS = ['billing', 'technical', 'returns', 'account_security'] as const;

export const TriageSuggestionSchema = z.object({
  /** One sentence: what the customer needs. */
  summary: z.string().min(5).max(400),
  category: z.enum(TICKET_CATEGORIES),
  categoryReason: z.string().min(5).max(400),
  priority: z.enum(TICKET_PRIORITIES),
  priorityReason: z.string().min(5).max(400),
  /** Reply for the agent to edit and send, with [n] citations; null if the help centre has nothing. */
  replyDraft: z.string().min(10).max(2000).nullable(),
  escalate: z.boolean(),
  escalationTeam: z.enum(ESCALATION_TEAMS).nullable(),
  escalationReason: z.string().max(400).nullable(),
  /** Optional note for colleagues (not sent to the customer). */
  internalNote: z.string().max(600).nullable(),
  confidence: z.enum(['low', 'medium', 'high']),
});
export type TriageSuggestion = z.infer<typeof TriageSuggestionSchema>;

export interface TriageProposal {
  id: string;
  type: 'set_category' | 'set_priority' | 'draft_reply' | 'add_internal_note' | 'escalate';
  payload: Record<string, unknown>;
  rationale: string;
  status: string;
  expiresAt: string;
}

export interface TriageRunResult {
  runId: string;
  ticketId: string;
  externalId: string;
  suggestion: TriageSuggestion;
  proposals: TriageProposal[];
  sources: { id: number; title: string; section: string; distance: number }[];
  /** Earlier pending proposals for this ticket that this run replaced. */
  supersededProposals: number;
  model: string;
  promptVersion: string;
  repaired: boolean;
  usage: { inputTokens: number; outputTokens: number; embeddingTokens: number };
  timings: { retrievalMs: number; generationMs: number; totalMs: number };
  traceId: string | null;
  traceUrl: string | null;
}
