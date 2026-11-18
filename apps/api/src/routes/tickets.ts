// Ticket routes (task 4.3).
//   GET  /tickets/:ref          ticket + its agent runs + proposed actions   (ref = external id or uuid)
//   POST /tickets/:ref/triage   run the triage agent -> PENDING proposals (needs FEATURE_AGENT_ENABLED)
import { Hono } from 'hono';
import { TicketNotFoundError, triageTicket } from '@sta/ai';
import { agentRuns, desc, eq, getDb, proposedActions, tickets } from '@sta/db';
import { config } from '@sta/shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ticketRoutes = new Hono()
  .get('/:ref', async (c) => {
    const ref = c.req.param('ref');
    const db = getDb();
    const [ticket] = await db
      .select()
      .from(tickets)
      .where(UUID.test(ref) ? eq(tickets.id, ref) : eq(tickets.externalId, ref))
      .limit(1);
    if (!ticket) return c.json({ error: 'not_found', message: `Ticket "${ref}" not found` }, 404);

    const runs = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.ticketId, ticket.id))
      .orderBy(desc(agentRuns.startedAt))
      .limit(5);
    const actions = await db
      .select()
      .from(proposedActions)
      .where(eq(proposedActions.ticketId, ticket.id))
      .orderBy(desc(proposedActions.createdAt))
      .limit(30);
    return c.json({ ticket, runs, actions });
  })
  .post('/:ref/triage', async (c) => {
    // Feature flag: the agent can be switched off without a deploy.
    if (!config.features.agentEnabled) {
      return c.json(
        {
          error: 'agent_disabled',
          message: 'The triage agent is disabled (FEATURE_AGENT_ENABLED=false).',
        },
        403,
      );
    }
    try {
      return c.json(await triageTicket(c.req.param('ref')));
    } catch (error) {
      if (error instanceof TicketNotFoundError) {
        return c.json({ error: 'not_found', message: error.message }, 404);
      }
      throw error; // handled by the central error handler
    }
  });
