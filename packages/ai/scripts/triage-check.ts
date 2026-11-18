// Triage check (a tiny eval): run the agent on the 12 sample tickets and compare its category and
// priority with what a human would choose. Uses real LLM calls (free tier) and creates pending
// proposals for the sample tickets (useful test data for the approvals UI).
// Usage: pnpm triage:check
import { closeDb, getDb, inArray, tickets } from '@sta/db';
import { triageQuery, triageTicket, warmQueryCache } from '../src/index';

// Expected labels chosen by a human reading each sample ticket (see the prompt's rubric).
const EXPECTED: Record<string, { category: string; priority: string }> = {
  'SAMPLE-001': { category: 'technical_issue', priority: 'medium' }, // battery dies quickly
  'SAMPLE-002': { category: 'technical_issue', priority: 'medium' }, // thermostat wiring
  'SAMPLE-003': { category: 'billing_inquiry', priority: 'high' }, // charged twice
  'SAMPLE-004': { category: 'technical_issue', priority: 'high' }, // lines on TV screen
  'SAMPLE-005': { category: 'technical_issue', priority: 'medium' }, // Wi-Fi setup
  'SAMPLE-006': { category: 'refund_request', priority: 'medium' }, // return opened phone
  'SAMPLE-007': { category: 'technical_issue', priority: 'critical' }, // photos lost
  'SAMPLE-008': { category: 'technical_issue', priority: 'medium' }, // grinding noise
  'SAMPLE-009': { category: 'cancellation_request', priority: 'medium' }, // cancel subscription
  'SAMPLE-010': { category: 'product_inquiry', priority: 'low' }, // works with Apple Health?
  'SAMPLE-011': { category: 'technical_issue', priority: 'high' }, // app crashes
  'SAMPLE-012': { category: 'technical_issue', priority: 'medium' }, // Bluetooth pairing
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const ids = Object.keys(EXPECTED);
  const rows = await getDb().select().from(tickets).where(inArray(tickets.externalId, ids));
  if (rows.length !== ids.length)
    throw new Error('Sample tickets missing: run pnpm seed:tickets:sample');

  // One embedding call for all 12 tickets (free tiers allow only a few requests per minute).
  const warmed = await warmQueryCache(rows.map(triageQuery));
  console.log(`embedded ${warmed} ticket queries in one call`);

  const results = [];
  let cat = 0;
  let pri = 0;
  let replies = 0;
  for (const id of ids) {
    try {
      const r = await triageTicket(id);
      const exp = EXPECTED[id]!;
      const catOk = r.suggestion.category === exp.category;
      const priOk = r.suggestion.priority === exp.priority;
      if (catOk) cat++;
      if (priOk) pri++;
      if (r.suggestion.replyDraft) replies++;
      results.push({
        ticket: id,
        category: `${r.suggestion.category}${catOk ? '' : ` ✗ (exp ${exp.category})`}`,
        priority: `${r.suggestion.priority}${priOk ? '' : ` ✗ (exp ${exp.priority})`}`,
        reply: r.suggestion.replyDraft ? 'yes' : 'no',
        escalate: r.suggestion.escalate ? r.suggestion.escalationTeam : '-',
        proposals: r.proposals.length,
        ms: r.timings.totalMs,
      });
    } catch (error) {
      results.push({
        ticket: id,
        category: `ERROR: ${error instanceof Error ? error.message.slice(0, 60) : error}`,
      });
    }
    await sleep(1500); // stay well under the LLM free-tier requests-per-minute limit
  }

  console.table(results);
  const n = ids.length;
  console.log(
    `category ${cat}/${n} (${Math.round((100 * cat) / n)}%) · priority ${pri}/${n} (${Math.round((100 * pri) / n)}%) · reply drafted ${replies}/${n}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
