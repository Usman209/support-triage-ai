// API entry point: start tracing first, then serve the Hono app on config.app.apiPort.
import { serve } from '@hono/node-server';
import { config } from '@sta/shared';
import { startTracing } from './instrumentation';
import { app } from './app';

const stopTracing = startTracing();

const server = serve({ fetch: app.fetch, port: config.app.apiPort }, (info) => {
  console.log(`${config.app.name} API listening on http://localhost:${info.port}`);
});

// Graceful shutdown: stop accepting requests, flush traces, then exit.
async function shutdown(signal: string) {
  console.log(`[api] ${signal} received, shutting down`);
  server.close();
  await stopTracing();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
