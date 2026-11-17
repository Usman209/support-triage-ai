// Health endpoints. GET /health = liveness.
// TODO task 3: add GET /health/ready (DB + LLM provider checks).
import { Hono } from 'hono';
import { config } from '@sta/shared';

export const healthRoutes = new Hono().get('/', (c) =>
  c.json({
    status: 'ok',
    service: config.app.name,
    env: config.app.nodeEnv,
    time: new Date().toISOString(),
  }),
);
