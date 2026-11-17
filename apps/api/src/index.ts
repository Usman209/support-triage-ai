// API entry point: serves the Hono app on config.app.apiPort.
import { serve } from '@hono/node-server';
import { config } from '@sta/shared';
import { app } from './app';

serve({ fetch: app.fetch, port: config.app.apiPort }, (info) => {
  console.log(`${config.app.name} API listening on http://localhost:${info.port}`);
});
