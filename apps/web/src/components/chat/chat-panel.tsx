'use client';
// Chat UI for support agents: ask a question, get a grounded answer with clickable citations.
// Each question is answered independently (no conversation memory yet).
import type { ChatResponse, ChatSource } from '@sta/shared';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { AnswerText } from './answer-text';

interface Turn {
  id: number;
  question: string;
  status: 'loading' | 'done' | 'error';
  response?: ChatResponse;
  error?: string;
}

const EXAMPLES = [
  'A customer was charged twice for the same order. What should I tell them?',
  'How long is an account locked after too many failed sign-ins?',
  "A customer's GoPro battery dies quickly. What can they try?",
  'Can customers pay with cryptocurrency?',
];

function errorMessage(data: unknown, status: number): string {
  const d = data as { message?: string; issues?: { message?: string }[] } | null;
  return d?.issues?.[0]?.message ?? d?.message ?? `Request failed (HTTP ${status})`;
}

export function ChatPanel({ initialQuestion }: { initialQuestion?: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [openSource, setOpenSource] = useState<ChatSource | null>(null);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const autoAsked = useRef(false);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const id = nextId.current++;
    setTurns((t) => [...t, { id, question: q, status: 'loading' }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorMessage(data, res.status));
      const response = data as ChatResponse;
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, status: 'done', response } : x)));
      setOpenSource(response.citations[0] ?? null);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      setTurns((t) => t.map((x) => (x.id === id ? { ...x, status: 'error', error } : x)));
    } finally {
      setBusy(false);
    }
  }

  // /chat?q=... asks a question straight from the URL (shareable links, demos, tests).
  useEffect(() => {
    if (initialQuestion && !autoAsked.current) {
      autoAsked.current = true;
      void ask(initialQuestion);
    }
  }, [initialQuestion]); // runs once per ?q= value; the ref guards React's dev double-run

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void ask(input);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter makes a new line.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void ask(input);
    }
  }

  return (
    <div className="chat-layout">
      <section className="chat-main" aria-label="Chat">
        <header className="chat-header">
          <h1>Help-centre assistant</h1>
          <p className="muted">
            Answers come only from the knowledge base, with sources. Each question is answered on
            its own.
          </p>
        </header>

        <div className="chat-log" aria-live="polite">
          {turns.length === 0 && (
            <div className="chat-empty">
              <p className="muted">Try a question:</p>
              <div className="examples">
                {EXAMPLES.map((q) => (
                  <button key={q} type="button" className="example" onClick={() => void ask(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn) => (
            <div key={turn.id} className="turn">
              <div className="bubble user">{turn.question}</div>

              {turn.status === 'loading' && (
                <div className="bubble assistant loading">
                  <span className="dot" /> Searching the help centre…
                </div>
              )}

              {turn.status === 'error' && (
                <div className="bubble assistant error" role="alert">
                  <strong>Something went wrong.</strong> {turn.error}
                </div>
              )}

              {turn.status === 'done' && turn.response && (
                <div className={`bubble assistant ${turn.response.answered ? '' : 'not-found'}`}>
                  {!turn.response.answered && (
                    <div className="not-found-label">Not in the help centre</div>
                  )}
                  <AnswerText
                    text={turn.response.answer}
                    validIds={turn.response.sources.map((s) => s.id)}
                    onCite={(id) =>
                      setOpenSource(turn.response?.sources.find((s) => s.id === id) ?? null)
                    }
                  />

                  {turn.response.sources.length > 0 && (
                    <div className="source-chips">
                      {turn.response.sources.map((s) => {
                        const cited = turn.response?.citations.some((c) => c.id === s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            className={`chip ${cited ? 'cited' : ''} ${openSource === s ? 'open' : ''}`}
                            onClick={() => setOpenSource(s)}
                            title={cited ? 'Cited in the answer' : 'Retrieved but not cited'}
                          >
                            [{s.id}] {s.section === s.title ? s.title : s.section}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <div className="meta">
                    {turn.response.model ?? 'no LLM call'} · {turn.response.usage.inputTokens}/
                    {turn.response.usage.outputTokens} tokens · {turn.response.timings.totalMs} ms ·{' '}
                    {turn.response.promptVersion}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <form className="chat-input" onSubmit={onSubmit}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about a ticket… (Enter to send, Shift+Enter for a new line)"
            rows={2}
            maxLength={1000}
            disabled={busy}
            aria-label="Question"
          />
          <button type="submit" disabled={busy || !input.trim()}>
            {busy ? 'Asking…' : 'Ask'}
          </button>
        </form>
      </section>

      <aside className="source-panel" aria-label="Source">
        {openSource ? (
          <>
            <div className="source-head">
              <span className="badge-id">[{openSource.id}]</span>
              <div>
                <h2>{openSource.title}</h2>
                <p className="muted">{openSource.section}</p>
              </div>
            </div>
            <div className="source-content">
              {/* Drop the "Title > Section" header line: it is already shown above. */}
              <AnswerText
                text={openSource.content.replace(/^[^\n]*\n+/, '')}
                validIds={[]}
                onCite={() => undefined}
                softWrap
              />
            </div>
            <p className="muted small">
              {openSource.source} · distance {openSource.distance}
            </p>
          </>
        ) : (
          <p className="muted">Click a citation like [1] to see the source text here.</p>
        )}
      </aside>
    </div>
  );
}
