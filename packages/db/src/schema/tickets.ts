// Support tickets (task 4). Loaded from data/raw/customer_support_tickets.csv in step 4.2
// WITHOUT personal data: no customer name, email, age or gender (data minimisation).
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Routing queue. Matches the dataset's ticket types. */
export const ticketCategory = pgEnum('ticket_category', [
  'refund_request',
  'technical_issue',
  'cancellation_request',
  'product_inquiry',
  'billing_inquiry',
]);

export const ticketPriority = pgEnum('ticket_priority', ['low', 'medium', 'high', 'critical']);

export const ticketStatus = pgEnum('ticket_status', ['open', 'pending_customer', 'closed']);

export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Id in the source system (here: "Ticket ID" from the CSV). Unique, so seeding is idempotent. */
    externalId: text('external_id').notNull().unique(),
    subject: text('subject').notNull(),
    description: text('description').notNull(),
    product: text('product'),
    channel: text('channel'),
    status: ticketStatus('status').notNull().default('open'),
    /** Current values. Null = not triaged yet. Only an APPROVED agent action may change them. */
    category: ticketCategory('category'),
    priority: ticketPriority('priority'),
    /**
     * Extra info, e.g. the dataset's own labels kept for reference only
     * (they are random, see docs/discovery-brief.md "Data findings").
     */
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tickets_status_idx').on(t.status)],
);

export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
