// Builds the Hono app: middleware + routes.
// TODO task 3: mount chat and tickets routes; TODO task 4: approvals; TODO task 8: auth + rate limit.
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { config } from '@sta/shared';
import { healthRoutes } from './routes/health';

export const app = new Hono();

app.use('*', logger());

app.get('/', (c) =>
  c.json({
    service: config.app.name,
    endpoints: ['/health'],
  }),
);

app.route('/health', healthRoutes);
