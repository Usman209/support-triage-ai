// drizzle-kit settings: where the schema is, where migrations go, how to connect.
// The connection string comes from config (DATABASE_URL in .env), never hardcoded.
import { defineConfig } from 'drizzle-kit';
import { config } from '@sta/shared';

if (!config.db.url) {
  throw new Error('DATABASE_URL is not set in .env');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: { url: config.db.url },
  strict: true,
  verbose: true,
});
