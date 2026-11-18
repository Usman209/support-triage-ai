// Triage one ticket from the command line. Creates PENDING proposals (nothing is executed).
// Usage: pnpm triage SAMPLE-003     (external id or uuid)
import { closeDb } from '@sta/db';
import { triageTicket } from '../src/index';

async function main() {
  const ref = process.argv[2];
  if (!ref) throw new Error('Usage: pnpm triage <ticket external id or uuid>');

  const r = await triageTicket(ref);
  const s = r.suggestion;
  console.log(`\nticket ${r.externalId} · run ${r.runId}`);
  console.log(`summary:    ${s.summary}`);
  console.log(`category:   ${s.category}   (${s.categoryReason})`);
  console.log(`priority:   ${s.priority}   (${s.priorityReason})`);
  console.log(`escalate:   ${s.escalate ? `${s.escalationTeam} (${s.escalationReason})` : 'no'}`);
  console.log(`confidence: ${s.confidence}${r.repaired ? ' · output was repaired once' : ''}`);
  console.log(`\nreply draft:\n${s.replyDraft ?? '(none: no grounded reply)'}`);
  console.log('\nsources:');
  for (const src of r.sources)
    console.log(`  [${src.id}] ${src.title} > ${src.section} (${src.distance})`);
  console.log(`\nPENDING proposals (expire in 30 min, need human approval):`);
  console.table(
    r.proposals.map((p) => ({
      type: p.type,
      payload: JSON.stringify(p.payload).slice(0, 60),
      status: p.status,
    })),
  );
  if (r.supersededProposals)
    console.log(`${r.supersededProposals} older pending proposal(s) superseded`);
  console.log(
    `${r.model} · ${r.usage.inputTokens}/${r.usage.outputTokens} tokens · ${r.timings.totalMs} ms · ${r.promptVersion}` +
      (r.traceUrl ? `\ntrace: ${r.traceUrl}` : ''),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
