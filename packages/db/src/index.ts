// Database client for the whole app: Drizzle ORM on top of the postgres.js driver.
//
// The connection is created lazily on the first getDb() call, so importing this package
// does not open a connection (useful for scripts and tests).
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '@sta/shared';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;

let client: ReturnType<typeof postgres> | undefined;
let db: Db | undefined;

export function getDb(): Db {
  if (db) return db;
  if (!config.db.url) {
    throw new Error('DATABASE_URL is not set in .env');
  }
  client = postgres(config.db.url, { max: 10 });
  db = drizzle(client, { schema });
  return db;
}

/** Close the connection pool (call at the end of scripts so the process can exit). */
export async function closeDb(): Promise<void> {
  await client?.end();
  client = undefined;
  db = undefined;
}

export * from './schema';
// Query helpers re-exported so other packages use the same drizzle-orm version as the schema.
export { and, desc, eq, inArray, like, notInArray, sql } from 'drizzle-orm';
