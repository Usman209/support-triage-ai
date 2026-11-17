// Home page: links to each area and live API status (fetched server-side).
import Link from 'next/link';
import { config } from '@sta/shared';

export const dynamic = 'force-dynamic';

type Health = { status: string; service: string; env: string; time: string };

async function getApiHealth(): Promise<Health | null> {
  try {
    const res = await fetch(`${config.app.apiUrl}/health`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as Health) : null;
  } catch {
    return null;
  }
}

const areas = [
  {
    href: '/chat',
    title: 'Chat',
    text: 'Ask questions, get answers with sources.',
    task: 'Task 3',
  },
  {
    href: '/approvals',
    title: 'Approvals',
    text: 'Review actions the agent proposes.',
    task: 'Task 4',
  },
  {
    href: '/dashboard',
    title: 'Dashboard',
    text: 'Volume, latency, cost and quality.',
    task: 'Task 10',
  },
];

export default async function HomePage() {
  const health = await getApiHealth();

  return (
    <>
      <h1>Support Triage AI</h1>
      <p className="muted">Starter shell. Features arrive task by task.</p>

      <div className="card">
        <strong>API status: </strong>
        {health ? (
          <span className="status-ok">online</span>
        ) : (
          <span className="status-bad">offline</span>
        )}
        <div className="muted">
          {config.app.apiUrl}/health
          {health ? ` · ${health.env} · ${health.time}` : ' · start it with pnpm dev:api'}
        </div>
      </div>

      <div className="grid">
        {areas.map((a) => (
          <Link key={a.href} href={a.href} className="card">
            <strong>{a.title}</strong>
            <div className="muted">{a.text}</div>
            <small className="muted">{a.task}</small>
          </Link>
        ))}
      </div>
    </>
  );
}
