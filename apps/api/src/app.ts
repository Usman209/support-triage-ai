// Builds the Hono app: middleware + routes.
// TODO task 4.4: approvals routes. TODO task 8: auth + rate limit.
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { config } from '@sta/shared';
import { errorHandler } from './middleware/error-handler';
import { chatRoutes } from './routes/chat';
import { healthRoutes } from './routes/health';
import { ticketRoutes } from './routes/tickets';

export const app = new Hono();

app.use('*', logger());
app.onError(errorHandler);

app.get('/', (c) =>
  c.json({
    service: config.app.name,
    endpoints: ['GET /health', 'POST /chat', 'GET /tickets/:ref', 'POST /tickets/:ref/triage'],
  }),
);

app.route('/health', healthRoutes);
app.route('/chat', chatRoutes);
app.route('/tickets', ticketRoutes);
