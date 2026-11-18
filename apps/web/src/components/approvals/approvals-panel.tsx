'use client';
// Approvals page (task 4.5): review what the triage agent proposed and approve, edit or reject it.
// Approving executes the action (API task 4.4). Nothing reaches the customer from here.
import {
  ESCALATION_TEAMS,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type ActionStatus,
  type ApprovalItem,
  type ApprovalsListResponse,
} from '@sta/shared/client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnswerText } from '@/components/chat/answer-text';

const TABS: { key: ActionStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'executed', label: 'Executed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'expired', label: 'Expired' },
  { key: 'failed', label: 'Failed' },
  { key: 'all', label: 'All' },
];

const TYPE_LABEL: Record<ApprovalItem['type'], string> = {
  set_category: 'Set category',
  set_priority: 'Set priority',
  draft_reply: 'Reply draft',
  add_internal_note: 'Internal note',
  escalate: 'Escalate',
};

const REVIEWER_KEY = 'sta-reviewer';
const pretty = (v: unknown) => String(v ?? 'not set').replace(/_/g, ' ');

function relative(iso: string | null): string {
  if (!iso) return '';
  const diff = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
  if (diff > 0) return `in ${diff} min`;
  if (diff === 0) return 'now';
  const ago = -diff;
  return ago < 60 ? `${ago} min ago` : `${Math.round(ago / 60)} h ago`;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const d = data as { message?: string } | null;
    throw new Error(d?.message ?? `Request failed (HTTP ${res.status})`);
  }
  return data as T;
}

/** Proposed value as readable text (or an editor when editing). */
function PayloadView({
  item,
  editing,
  draft,
  setDraft,
}: {
  item: ApprovalItem;
  editing: boolean;
  draft: Record<string, unknown>;
  setDraft: (d: Record<string, unknown>) => void;
}) {
  const p = editing ? draft : item.payload;
  switch (item.type) {
    case 'set_category':
    case 'set_priority': {
      const key = item.type === 'set_category' ? 'category' : 'priority';
      const options = key === 'category' ? TICKET_CATEGORIES : TICKET_PRIORITIES;
      const current = key === 'category' ? item.ticket.category : item.ticket.priority;
      return editing ? (
        <select value={String(p[key])} onChange={(e) => setDraft({ [key]: e.target.value })}>
          {options.map((o) => (
            <option key={o} value={o}>
              {pretty(o)}
            </option>
          ))}
        </select>
      ) : (
        <span>
          <span className="muted">{pretty(current)} →</span> <strong>{pretty(p[key])}</strong>
        </span>
      );
    }
    case 'escalate':
      return editing ? (
        <select value={String(p.team)} onChange={(e) => setDraft({ team: e.target.value })}>
          {ESCALATION_TEAMS.map((t) => (
            <option key={t} value={t}>
              {pretty(t)}
            </option>
          ))}
        </select>
      ) : (
        <span>
          to team <strong>{pretty(p.team)}</strong>
        </span>
      );
    case 'add_internal_note':
      return editing ? (
        <textarea
          rows={3}
          value={String(p.note ?? '')}
          onChange={(e) => setDraft({ note: e.target.value })}
        />
      ) : (
        <span>{String(p.note)}</span>
      );
    case 'draft_reply': {
      const citations = (p.citations as { id: number; title: string; section: string }[]) ?? [];
      return (
        <div className="reply-draft">
          {editing ? (
            <textarea
              rows={6}
              value={String(p.reply ?? '')}
              onChange={(e) => setDraft({ ...draft, reply: e.target.value })}
            />
          ) : (
            <AnswerText text={String(p.reply)} validIds={[]} onCite={() => undefined} />
          )}
          {citations.length > 0 && (
            <ul className="cite-list">
              {citations.map((c) => (
                <li key={c.id}>
                  [{c.id}] {c.title} › {c.section}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
  }
}

function ActionRow({
  item,
  reviewer,
  onDone,
}: {
  item: ApprovalItem;
  reviewer: string;
  onDone: (message: string) => void;
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'reject'>('view');
  const [draft, setDraft] = useState<Record<string, unknown>>(item.payload);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = item.status === 'pending';

  async function decide(decision: 'approve' | 'reject', payload?: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await call(`/api/approvals/${item.id}/${decision}`, {
        method: 'POST',
        body: JSON.stringify({ reviewer, note: note || undefined, payload }),
      });
      onDone(
        `${TYPE_LABEL[item.type]}: ${decision === 'approve' ? 'approved and executed' : 'rejected'}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className={`action-row status-${item.status}`}>
      <div className="action-head">
        <span className="action-type">{TYPE_LABEL[item.type]}</span>
        <span className={`status-pill ${item.status}`}>{item.status}</span>
        <span className="muted small">
          {pending
            ? `expires ${relative(item.expiresAt)}`
            : `${item.decidedBy ?? ''} · ${relative(item.decidedAt)}`}
        </span>
      </div>

      <div className="action-body">
        <PayloadView item={item} editing={mode === 'edit'} draft={draft} setDraft={setDraft} />
      </div>
      <p className="why">
        <span className="muted">Why:</span> {item.rationale}
      </p>
      {item.decisionNote && <p className="muted small">Note: {item.decisionNote}</p>}
      {item.status === 'failed' && item.result && (
        <p className="error-text small">Execution failed: {String(item.result.error)}</p>
      )}
      {error && <p className="error-text small">{error}</p>}

      {pending && mode === 'view' && (
        <div className="action-buttons">
          <button className="btn approve" disabled={busy} onClick={() => void decide('approve')}>
            Approve
          </button>
          <button className="btn" disabled={busy} onClick={() => setMode('edit')}>
            Edit
          </button>
          <button className="btn reject" disabled={busy} onClick={() => setMode('reject')}>
            Reject
          </button>
        </div>
      )}
      {pending && mode === 'edit' && (
        <div className="action-buttons">
          <button
            className="btn approve"
            disabled={busy}
            onClick={() => void decide('approve', draft)}
          >
            Approve edited
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => {
              setDraft(item.payload);
              setMode('view');
            }}
          >
            Cancel
          </button>
        </div>
      )}
      {pending && mode === 'reject' && (
        <div className="action-buttons">
          <input
            placeholder="Reason (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
          <button className="btn reject" disabled={busy} onClick={() => void decide('reject')}>
            Confirm reject
          </button>
          <button className="btn" disabled={busy} onClick={() => setMode('view')}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export function ApprovalsPanel() {
  const [tab, setTab] = useState<ActionStatus | 'all'>('pending');
  const [data, setData] = useState<ApprovalsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [reviewer, setReviewer] = useState('agent-1');
  const [ticketRef, setTicketRef] = useState('SAMPLE-003');
  const [triaging, setTriaging] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REVIEWER_KEY);
      if (saved) setReviewer(saved);
    } catch {
      /* storage blocked: keep the default name */
    }
  }, []);

  const load = useCallback(async (status: ActionStatus | 'all') => {
    setLoading(true);
    setError(null);
    try {
      setData(await call<ApprovalsListResponse>(`/api/approvals?status=${status}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [tab, load]);

  // Group actions by ticket so the reviewer sees one ticket at a time.
  const groups = useMemo(() => {
    const map = new Map<string, ApprovalItem[]>();
    for (const item of data?.items ?? []) {
      const list = map.get(item.ticket.id) ?? [];
      list.push(item);
      map.set(item.ticket.id, list);
    }
    return [...map.values()];
  }, [data]);

  function saveReviewer(name: string) {
    setReviewer(name);
    try {
      localStorage.setItem(REVIEWER_KEY, name);
    } catch {
      /* ignore */
    }
  }

  async function runTriage() {
    if (!ticketRef.trim()) return;
    setTriaging(true);
    setFlash(null);
    setError(null);
    try {
      const r = await call<{
        proposals: unknown[];
        externalId: string;
        supersededProposals: number;
      }>(`/api/tickets/${encodeURIComponent(ticketRef.trim())}/triage`, { method: 'POST' });
      setFlash(
        `Triage of ${r.externalId}: ${r.proposals.length} new proposals` +
          (r.supersededProposals ? ` (${r.supersededProposals} older ones superseded)` : ''),
      );
      setTab('pending');
      await load('pending');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTriaging(false);
    }
  }

  return (
    <div className="approvals-layout">
      <header className="approvals-header">
        <div>
          <h1>Approvals</h1>
          <p className="muted">
            The triage agent only proposes. Approving runs the action on the ticket; nothing is sent
            to the customer from here.
          </p>
        </div>
        <label className="reviewer">
          <span className="muted small">Reviewing as</span>
          <input value={reviewer} onChange={(e) => saveReviewer(e.target.value)} maxLength={80} />
        </label>
      </header>

      <div className="card triage-box">
        <strong>Triage a ticket</strong>
        <input
          value={ticketRef}
          onChange={(e) => setTicketRef(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void runTriage()}
          placeholder="Ticket id, e.g. SAMPLE-003 or 42"
          disabled={triaging}
        />
        <button className="btn approve" disabled={triaging} onClick={() => void runTriage()}>
          {triaging ? 'Triaging… (~5 s)' : 'Run triage'}
        </button>
        <span className="muted small">Try SAMPLE-001 … SAMPLE-012, or a dataset id like 42.</span>
      </div>

      {flash && <div className="flash">{flash}</div>}
      {error && <div className="flash error-flash">{error}</div>}

      <nav className="tabs" aria-label="Status filter">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.key !== 'all' && data ? <span className="count">{data.counts[t.key]}</span> : null}
          </button>
        ))}
      </nav>

      {loading && <p className="muted">Loading…</p>}
      {!loading && groups.length === 0 && (
        <div className="card muted">
          {tab === 'pending'
            ? 'Nothing waiting for approval. Run triage on a ticket above.'
            : 'Nothing here yet.'}
        </div>
      )}

      {groups.map((items) => {
        const t = items[0]!.ticket;
        const run = items[0]!.run;
        return (
          <section key={t.id} className="card ticket-card">
            <div className="ticket-head">
              <div>
                <h2>
                  #{t.externalId} · {t.subject}
                </h2>
                <p className="muted small">
                  {t.product ?? 'unknown product'} · now: category{' '}
                  <strong>{pretty(t.category)}</strong>, priority{' '}
                  <strong>{pretty(t.priority)}</strong>
                </p>
              </div>
              {run.confidence && (
                <span className={`status-pill conf-${run.confidence}`}>
                  confidence {run.confidence}
                </span>
              )}
            </div>
            {run.summary && <p className="summary">{run.summary}</p>}
            <details>
              <summary className="muted small">Customer message</summary>
              <p className="customer-msg">{t.description}</p>
            </details>

            <div className="actions">
              {items.map((item) => (
                <ActionRow
                  key={item.id}
                  item={item}
                  reviewer={reviewer}
                  onDone={(msg) => {
                    setFlash(msg);
                    void load(tab);
                  }}
                />
              ))}
            </div>
            <p className="muted small">
              {run.model} · {run.promptVersion}
              {run.traceUrl && (
                <>
                  {' · '}
                  <a href={run.traceUrl} target="_blank" rel="noreferrer">
                    view trace ↗
                  </a>
                </>
              )}
            </p>
          </section>
        );
      })}
    </div>
  );
}
