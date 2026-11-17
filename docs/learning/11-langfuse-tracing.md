# Step 11 (Task 3.6): Langfuse tracing

## 1. Goal

See inside every chat request: which chunks were retrieved, what prompt the model got, what it
answered, tokens, latency per step, and errors, in Langfuse Cloud.

## 2. What we built

| File                                          | What                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/api/src/instrumentation.ts`             | Registers an OpenTelemetry tracer that exports to Langfuse (`LangfuseSpanProcessor`)           |
| `apps/api/src/index.ts`                       | Starts tracing before the server; flushes traces on shutdown (SIGINT/SIGTERM)                  |
| `packages/ai/src/providers/traced.ts`         | Decorators: every LLM call = `generation`, every embedding call = `embedding`                  |
| `packages/ai/src/providers/index.ts`          | Factory wraps every provider with the decorators                                               |
| `packages/ai/src/rag/retriever.ts`            | `retrieve` = `retriever` observation (chunks, distances, cache hit)                            |
| `packages/ai/src/rag/answer.ts`               | Whole request = trace `rag-chat` with root `chain` observation; returns `traceId` + `traceUrl` |
| `apps/web/src/components/chat/chat-panel.tsx` | "view trace ↗" link in the meta line                                                           |
| `.env`                                        | `LANGFUSE_TRACING_ENABLED`, `LANGFUSE_PROJECT_ID` (for links)                                  |
| `package.json`, `.nvmrc`, CI                  | **Node 22** (the Langfuse exporter requires it)                                                |

What one trace looks like (real data):

```
trace rag-chat  (tags: rag, answer-v2)
- CHAIN       rag-answer     2908 ms   input: question · output: answer, citations
  - RETRIEVER   retrieve       2020 ms   output: 8 chunks with distances · cacheHit
    - EMBEDDING   embed.voyage   1515 ms   voyage-4 · 12 tokens
  - GENERATION  llm.groq        839 ms   gpt-oss-120b · 687 in / 70 out tokens
```

Insight from the first trace: **retrieval (2 s) was slower than the LLM (0.8 s)**, mostly the
embedding call. Without tracing we would have guessed the LLM.

## 3. Why this way

- **OpenTelemetry (OTel) standard**: Langfuse's current SDK records OTel spans. The same
  instrumentation can later also go to SigNoz or another OTel backend (task 10).
- **Library records, app exports**: `@sta/ai` only calls `startActiveObservation` (no-op when no
  tracer is registered), the API decides where traces go. Scripts (`ingest`, `kb:check`) keep
  working without Langfuse.
- **Decorator pattern for providers**: every model call is traced automatically, including future
  ones (agent, evals). Callers don't change.
- **Typed observations** (`chain`, `retriever`, `embedding`, `generation`): Langfuse shows them with
  the right fields (model, tokens, input/output) and computes totals.
- **Context propagation**: the active observation is carried automatically, so children nest
  under the right parent without passing IDs around.
- **`level: WARNING` for "not found"**: easy to filter unanswered questions = knowledge-base gaps.
- **Trace id in the response + link in the UI**: from a bad answer straight to its trace.
- **Settings in `.env` and passed explicitly**: the SDK would read `LANGFUSE_BASE_URL`; we pass
  `LANGFUSE_HOST` from `config`, keeping "only config.ts reads env".
- **Big inputs summarised**: ingestion batches log "74 texts", not all the text.
- **Flush on shutdown**: spans are sent in batches; without a flush the last ones are lost.

## 4. How it works

```
API start: startTracing() -> NodeTracerProvider + LangfuseSpanProcessor(keys, host) -> register()
request:   propagateAttributes(traceName, tags)
             startActiveObservation('rag-answer', chain)
               retrieve()           -> startActiveObservation('retrieve', retriever)
                 embed()            -> traced decorator ('embed.voyage', embedding)
               chat()               -> traced decorator ('llm.groq', generation)
           -> spans batched and exported to Langfuse in the background
response:  { ..., traceId, traceUrl }
```

## 5. Try it yourself

1. Ask a question at http://localhost:3010/chat, click **view trace ↗**.
2. In Langfuse: open the trace tree; click `llm.groq` to see the exact prompt (system + numbered
   sources) and the answer; check tokens and latency.
3. Filter traces by level **WARNING**: these are "not found" questions (knowledge-base gaps).
4. Ask the same question twice: in the second trace there is **no** `embed.voyage` child
   (`cacheHit: true`).
5. Set `LANGFUSE_TRACING_ENABLED=false`, restart `pnpm dev:api`: the log says `[tracing] off`
   and answers have no trace link. Set it back.

## 6. Problems we faced

| Problem                                                         | Cause                                                                         | Fix                                                      | Lesson                                                                   |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| New Langfuse SDK needs Node ≥ 22; project said Node 20          | SDK moved to OpenTelemetry                                                    | Bumped `engines`, `.nvmrc`, CI to Node 22                | Read requirements before adding a dependency                             |
| SDK expects `LANGFUSE_BASE_URL`; we have `LANGFUSE_HOST`        | Env names differ                                                              | Pass keys/host explicitly from `config`                  | Keep one source of config; don't let libraries read env behind your back |
| Shell quoting broke a scripted edit (backticks ran as commands) | Template literals inside a double-quoted shell string                         | Edited with the editor tool; checked the damage          | Don't put code with backticks in shell strings                           |
| `EADDRINUSE :3011` after edits                                  | `tsx watch` restarted twice quickly; one instance kept the port               | Checked which process served and that it had new code    | Know your dev tools' restart behaviour                                   |
| Langfuse old trace API returned 410                             | `GET /api/public/traces/:id` removed (2026-11-16)                             | Used `GET /api/public/v2/observations`                   | APIs get deprecated; read the error body                                 |
| First trace never arrived                                       | Langfuse Cloud unreachable for a short time (DNS/timeout) while exporting     | Waited for health 200, sent a new request: trace arrived | Tracing is best-effort: the user still got the answer                    |
| "view trace" link missing in the UI                             | Web dev server served an old bundle (file watcher missed the edit on Windows) | Restarted `pnpm dev:web`                                 | If the UI ignores your change, check what the server actually serves     |

## 7. Interview questions

**Q: What is the difference between logging and tracing?**
Logs are separate lines. A trace links all steps of one request (spans with parent/child, timing,
inputs/outputs), so you see where time and errors happen.

**Q: How do you trace an LLM application?**
One trace per request; spans for retrieval, embedding, LLM calls and tools; record model,
prompt, output, tokens, latency, errors; tag with prompt version and user/session; link traces to
evals and user feedback.

**Q: Why OpenTelemetry?**
Vendor-neutral standard: instrument once, export to any backend (Langfuse, SigNoz, Datadog),
and combine LLM spans with HTTP/database spans.

**Q: What if the tracing backend is down?**
Tracing must never break the request: export in the background, drop or buffer spans, keep
answering. We saw exactly that during a short Langfuse outage.

**Q: What sensitive data can end up in traces, and how do you handle it?**
Prompts and answers can contain customer PII. Mask before export (the span processor has a `mask`
hook, task 8), restrict access, choose data region and retention.

**Q: What did tracing teach you here?**
Retrieval, not the LLM, was the slowest part (embedding API 1.5 s). That points to caching
(already added) or a faster/closer embedding provider.

## 8. Key takeaways

- Instrument once (OTel), choose the backend in the app.
- Trace every model call automatically with decorators.
- Traces turn guesses about latency and quality into facts.
