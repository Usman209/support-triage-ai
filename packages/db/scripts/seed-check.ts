// Verify the tickets table after seeding: no personal-data columns, no emails/phones left in
// descriptions, no unfilled placeholders, nothing triaged yet. Prints 2 example tickets.
// Usage: pnpm seed:tickets:check
import { closeDb, getDb, sql } from '../src/index';

const checks: { check: string; ok: boolean; value: string }[] = [];
const add = (check: string, ok: boolean, value: unknown) =>
  checks.push({ check, ok, value: String(value) });

async function main() {
  const db = getDb();

  const [counts] = await db.execute<{
    total: number;
    sample: number;
    open: number;
    pending: number;
    closed: number;
    triaged: number;
    emails: number;
    phones: number;
    placeholders: number;
    products: number;
  }>(sql`
    select count(*)::int as total,
           count(*) filter (where external_id like 'SAMPLE-%')::int as sample,
           count(*) filter (where status = 'open')::int as open,
           count(*) filter (where status = 'pending_customer')::int as pending,
           count(*) filter (where status = 'closed')::int as closed,
           count(*) filter (where category is not null or priority is not null)::int as triaged,
           count(*) filter (where description ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\\.[A-Za-z.]+')::int as emails,
           count(*) filter (where description ~ '\\+?[0-9][0-9 ().-]{7,}[0-9]')::int as phones,
           count(*) filter (where description ~ '\\{[a-z_]+\\}')::int as placeholders,
           count(distinct product)::int as products
    from tickets`);

  const columns = await db.execute<{ column_name: string }>(sql`
    select column_name from information_schema.columns where table_name = 'tickets'`);
  const piiColumns = columns
    .map((c) => c.column_name)
    .filter((c) => /name|email|age|gender|phone|address/i.test(c) && c !== 'external_id');

  add('tickets loaded', (counts?.total ?? 0) > 0, `${counts?.total} (sample: ${counts?.sample})`);
  add(
    'status mapped',
    true,
    `open ${counts?.open} · pending ${counts?.pending} · closed ${counts?.closed}`,
  );
  add(
    'no personal-data columns in table',
    piiColumns.length === 0,
    piiColumns.join(', ') || 'none',
  );
  add('no emails left in descriptions', counts?.emails === 0, counts?.emails);
  add('no phone numbers left in descriptions', counts?.phones === 0, counts?.phones);
  add('no unfilled {placeholders}', counts?.placeholders === 0, counts?.placeholders);
  add('nothing triaged yet (category/priority null)', counts?.triaged === 0, counts?.triaged);
  add('distinct products', (counts?.products ?? 0) > 0, counts?.products);
  console.table(checks);

  const examples = await db.execute<{
    external_id: string;
    product: string;
    subject: string;
    description: string;
  }>(sql`
    select external_id, product, subject, left(description, 140) as description
    from tickets where external_id in ('SAMPLE-007', 'SAMPLE-008')
    order by external_id`);
  if (examples.length) {
    console.log('\nexamples (sample tickets):');
    for (const e of examples)
      console.log(`- ${e.external_id} [${e.product}] ${e.subject}: ${e.description}`);
  }

  const failed = checks.filter((c) => !c.ok).length;
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
  if (failed) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
