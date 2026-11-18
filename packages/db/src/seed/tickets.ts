// Load support tickets from the dataset CSV into the `tickets` table (task 4.2).
//
// Privacy by design:
// - Personal columns (customer name, email, age, gender, purchase date) are NEVER read into the
//   database: we only map the columns we need.
// - Free text can contain personal data too: emails and phone numbers inside descriptions are
//   replaced with [email] / [phone]. (Full PII redaction comes in task 8.)
//
// Data cleaning:
// - The dataset is template-generated: descriptions contain placeholders like {product_purchased}.
//   We fill them with the ticket's product; unknown placeholders become "[…]".
//
// Idempotent: upsert on external_id. Re-running updates source fields but NEVER overwrites
// category/priority, because those may have been set by approved agent actions.
import { readFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { sql } from 'drizzle-orm';
import { getDb } from '../index';
import { tickets, type NewTicket } from '../schema';

/** Columns we read. Everything else in the CSV (incl. all personal data) is ignored. */
interface CsvRow {
  'Ticket ID': string;
  'Product Purchased': string;
  'Ticket Type': string;
  'Ticket Subject': string;
  'Ticket Description': string;
  'Ticket Status': string;
  'Ticket Priority': string;
  'Ticket Channel': string;
}

const REQUIRED_COLUMNS: (keyof CsvRow)[] = [
  'Ticket ID',
  'Product Purchased',
  'Ticket Subject',
  'Ticket Description',
  'Ticket Status',
];

const STATUS_MAP: Record<string, NewTicket['status']> = {
  Open: 'open',
  'Pending Customer Response': 'pending_customer',
  Closed: 'closed',
};

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// 8+ digits, optionally with spaces, dots, dashes, brackets, leading +. Errs on the safe side.
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
const PLACEHOLDER = /\{([a-z_]+)\}/g;

export interface CleanStats {
  placeholdersFilled: number;
  placeholdersUnknown: number;
  emailsRedacted: number;
  phonesRedacted: number;
}

/** Fill placeholders and redact contact details in one description. */
export function cleanDescription(text: string, product: string, stats: CleanStats): string {
  const known: Record<string, string> = {
    product_purchased: product,
    product_name: product,
    product: product,
    error_message: 'an error message',
  };
  let out = text.replace(PLACEHOLDER, (_m, name: string) => {
    const value = known[name];
    if (value) {
      stats.placeholdersFilled++;
      return value;
    }
    stats.placeholdersUnknown++;
    return '[…]';
  });
  out = out.replace(EMAIL, () => {
    stats.emailsRedacted++;
    return '[email]';
  });
  out = out.replace(PHONE, () => {
    stats.phonesRedacted++;
    return '[phone]';
  });
  return out.trim();
}

export interface SeedReport extends CleanStats {
  file: string;
  rowsRead: number;
  inserted: number;
  updated: number;
  skipped: { row: number; reason: string }[];
  durationMs: number;
}

const BATCH_SIZE = 500;

export async function seedTickets(filePath: string, limit?: number): Promise<SeedReport> {
  const started = Date.now();
  const text = await readFile(filePath, 'utf8');

  // A real CSV parser: quotes, commas and line breaks inside fields, BOM.
  const all = parse(text, { columns: true, skip_empty_lines: true, bom: true, trim: false }) as (
    CsvRow | Record<string, string>
  )[];
  const rows = limit ? all.slice(0, limit) : all;

  const header = Object.keys(all[0] ?? {});
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`CSV is missing columns: ${missing.join(', ')}`);

  const stats: CleanStats = {
    placeholdersFilled: 0,
    placeholdersUnknown: 0,
    emailsRedacted: 0,
    phonesRedacted: 0,
  };
  const report: SeedReport = {
    file: filePath,
    rowsRead: rows.length,
    inserted: 0,
    updated: 0,
    skipped: [],
    durationMs: 0,
    ...stats,
  };

  const values: NewTicket[] = [];
  rows.forEach((raw, i) => {
    const r = raw as CsvRow;
    const rowNumber = i + 2; // +1 header, +1 because humans count from 1
    const status = STATUS_MAP[r['Ticket Status']?.trim()];
    if (!r['Ticket ID']?.trim())
      return report.skipped.push({ row: rowNumber, reason: 'no Ticket ID' });
    if (!status)
      return report.skipped.push({
        row: rowNumber,
        reason: `unknown status "${r['Ticket Status']}"`,
      });

    const product = r['Product Purchased']?.trim() || 'the product';
    values.push({
      externalId: r['Ticket ID'].trim(),
      subject: r['Ticket Subject'].trim(),
      description: cleanDescription(r['Ticket Description'] ?? '', product, stats),
      product,
      channel: r['Ticket Channel']?.trim() || null,
      status,
      // Not triaged yet: only approved agent actions set these.
      category: null,
      priority: null,
      metadata: {
        source: 'customer_support_tickets.csv',
        // Kept for reference only: these labels are random (docs/discovery-brief.md).
        datasetLabels: {
          type: r['Ticket Type'] ?? null,
          priority: r['Ticket Priority'] ?? null,
        },
      },
    });
  });

  const db = getDb();
  for (let i = 0; i < values.length; i += BATCH_SIZE) {
    const batch = values.slice(i, i + BATCH_SIZE);
    const result = await db
      .insert(tickets)
      .values(batch)
      .onConflictDoUpdate({
        target: tickets.externalId,
        // Source fields only. category/priority are NOT here on purpose.
        set: {
          subject: sql`excluded.subject`,
          description: sql`excluded.description`,
          product: sql`excluded.product`,
          channel: sql`excluded.channel`,
          status: sql`excluded.status`,
          metadata: sql`excluded.metadata`,
          updatedAt: sql`now()`,
        },
      })
      // Postgres trick: xmax = 0 means the row was inserted, otherwise it was updated.
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    for (const r of result) {
      if (r.inserted) report.inserted++;
      else report.updated++;
    }
  }

  Object.assign(report, stats);
  report.durationMs = Date.now() - started;
  return report;
}
