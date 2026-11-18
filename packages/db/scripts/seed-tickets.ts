// Load tickets from a CSV into the tickets table (no personal data). Safe to run many times.
// Usage:
//   pnpm seed:tickets:sample            12 sample tickets (data/sample/...sample.csv)
//   pnpm seed:tickets                   full dataset (TICKETS_CSV_PATH in .env)
//   pnpm seed:tickets -- --limit 100    first 100 rows only
//   pnpm seed:tickets -- --file <path>  any CSV with the same columns
import { resolve } from 'node:path';
import { config } from '@sta/shared';
import { closeDb } from '../src/index';
import { seedTickets } from '../src/seed/tickets';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const fileArg = arg('file');
  const file = fileArg ? resolve(config.rag.projectRoot, fileArg) : config.rag.ticketsCsvPath;
  const limit = arg('limit') ? Number(arg('limit')) : undefined;

  console.log(`loading ${file}${limit ? ` (first ${limit} rows)` : ''} ...`);
  const r = await seedTickets(file, limit);
  console.table({
    'rows read': r.rowsRead,
    inserted: r.inserted,
    'updated (already existed)': r.updated,
    skipped: r.skipped.length,
    'placeholders filled': r.placeholdersFilled,
    'unknown placeholders -> […]': r.placeholdersUnknown,
    'emails redacted': r.emailsRedacted,
    'phones redacted': r.phonesRedacted,
    'duration ms': r.durationMs,
  });
  for (const s of r.skipped.slice(0, 10)) console.log(`skipped row ${s.row}: ${s.reason}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
