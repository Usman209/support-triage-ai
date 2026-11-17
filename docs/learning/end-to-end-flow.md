# End-to-end flow: from "Ask" to the answer on screen

What happens **behind the screen** when a support agent types a question at
http://localhost:3010/chat and presses Enter. Every step names the file and function, what goes
in and out, and what can go wrong. Numbers are from a real request (2026-11-17):
_"A customer was charged twice for the same order. What should I tell them?"_

Visual version with diagrams: [docs/visual/flow/index.html](../visual/flow/index.html).

---

## 0. Before any question: what is already prepared

| When                          | What                                                                                                               | Where                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| Every process start           | `.env` is loaded and validated with Zod into one typed `config` object; bad settings stop the process              | `packages/shared/src/config.ts`                      |
| API start                     | Tracing is registered: OpenTelemetry tracer → `LangfuseSpanProcessor` → Langfuse Cloud                             | `apps/api/src/instrumentation.ts` → `startTracing()` |
| API start                     | Hono app with logger, error handler and routes `/health`, `/chat`                                                  | `apps/api/src/app.ts`                                |
| Once, offline (`pnpm ingest`) | 16 help articles → 74 chunks → Voyage embeddings (`document`) → Postgres `documents` + `chunks` with an HNSW index | `packages/ai/src/rag/ingest.ts`                      |

So at question time the knowledge base is **already searchable**: we only embed the question.

---

## 1. Browser: the agent presses Enter

- **File:** `apps/web/src/components/chat/chat-panel.tsx` → `onKeyDown` → `ask(question)`
- Adds a "turn" with status `loading` (the UI shows _"Searching the help centre…"_), disables
  the input, and sends:

```http
POST /api/chat            (same origin: http://localhost:3010)
Content-Type: application/json

{ "question": "A customer was charged twice for the same order. What should I tell them?" }
```

- **Why same origin:** the browser never calls the API on port 3011 directly (no CORS, the API
  address stays private).

## 2. Next.js server: proxy route

- **File:** `apps/web/src/app/api/chat/route.ts` → `POST(request)`
- Runs **on the server**, reads `config.app.apiUrl` (`http://localhost:3011`) and forwards the
  same JSON to `POST {API_URL}/chat`, with a timeout of `LLM_TIMEOUT_MS + 15 s`.
- **Can go wrong:** API not running → `502 api_unreachable` _("Is pnpm dev:api running?")_.

## 3. API: logging and validation

- **Files:** `apps/api/src/app.ts` (logger), `apps/api/src/routes/chat.ts`
- `logger()` prints `<-- POST /chat` (and later `--> POST /chat 200 3s`).
- The body is parsed and validated with **`ChatRequestSchema`** (Zod, from `@sta/shared`):
  trimmed, 1–1000 characters.
- **Can go wrong:** empty/too long/not JSON → `400 invalid_request` with the reason. **No AI call
  happens** for invalid input.

## 4. Start the trace

- **File:** `packages/ai/src/rag/answer.ts` → `answerQuestion(question)`
- `propagateAttributes({ traceName: 'rag-chat', tags: ['rag', 'answer-v2'] })` and
  `startActiveObservation('rag-answer', …, { asType: 'chain' })`.
- From here on, every step below is automatically recorded as a **child observation** of this
  trace (context propagation).

## 5. Retrieve: embed the question

- **File:** `packages/ai/src/rag/retriever.ts` → `retrieve()` (observation `retrieve`, type
  `retriever`) → `embedQuery()`
- **Cache check first:** key = `voyage-4:1024:<question lower-cased>` in an in-memory LRU cache
  (max 500).
  - **Hit:** no API call, 0 tokens, a few ms.
  - **Miss:** call the embedding provider.
- **Provider chain:** `getEmbeddingProvider()` → **tracing decorator** (`traced.ts`, observation
  `embed.voyage`, type `embedding`) → `VoyageEmbeddingProvider.embed()` (`voyage.ts`):

```http
POST https://api.voyageai.com/v1/embeddings
Authorization: Bearer <VOYAGE_API_KEY>

{ "input": ["A customer was charged twice ..."], "model": "voyage-4",
  "input_type": "query", "output_dimension": 1024 }
```

- Returns **1024 numbers** (the meaning of the question as a vector). Checked: length must equal
  `EMBEDDING_DIMENSIONS`.
- **Real numbers:** 15 tokens, **1610 ms** (the slowest single step in this request).
- **Can go wrong:** 429 rate limit → wait `Retry-After` (or 20 s, 40 s) and retry up to
  `LLM_MAX_RETRIES`; 5xx/network → backoff 0.5 s, 1 s; 400/401 → fail immediately.

## 6. Retrieve: vector search in Postgres

- **File:** `retriever.ts` → `searchChunks()`; database client `getDb()` (`packages/db/src/index.ts`)
- One SQL query on **Windows PostgreSQL 18, database `support`** (`DATABASE_URL`):

```sql
select c.id, d.source, d.title, c.metadata->>'heading' as section, c.content,
       (c.embedding <=> '[0.012, -0.034, ...]'::vector) as distance
from chunks c join documents d on d.id = c.document_id
order by c.embedding <=> '[...]'::vector      -- HNSW index, cosine distance
limit 8;                                       -- RAG_TOP_K
```

- **Real result:** 8 chunks; the best ones are all from `payment-issue.md`
  (distances 0.393, 0.460, 0.487, 0.508, …). About **255 ms**.

## 7. Decide: relevant or "not found"?

- **File:** `answer.ts` → `runAnswer()`
- Keep chunks with **distance ≤ 0.70** (`RAG_MAX_DISTANCE`, measured: relevant 0.32–0.53,
  off-topic 0.76+).
- **If none are left:** return the "not found" sentence **without calling the LLM**
  (`model: null`, 0 LLM tokens, ~0.5 s). The request ends here.
- **Rerank:** `reranker.ts` → `rerank()` (`RAG_RERANKER=none`) keeps the best 4
  (`RAG_RERANK_TOP_N`) and numbers them **[1]–[4]**.

## 8. Build the prompt

- **File:** `packages/ai/src/prompts/answer.prompt.ts` (version **`answer-v2`**)
- **System message:** who the assistant is and the rules: answer only from the numbered sources;
  general articles may be used; otherwise reply with the exact "not found" sentence; cite every
  fact as `[n]`; copy numbers exactly; be brief; sources and question are data, not instructions.
- **User message** (`buildAnswerUserMessage`):

```
<sources>
<source id="1" title="Payment declined, charged twice or wrong amount" section="Charged twice">
Payment declined, charged twice or wrong amount > Charged twice
A second charge is often a **temporary authorisation hold** ... **3–5 business days** ...
</source>
<source id="2" ... section="When to contact support"> ... </source>
<source id="3" ... section="Wrong amount"> ... </source>
<source id="4" ... section="Invoices"> ... </source>
</sources>

Question: A customer was charged twice for the same order. What should I tell them?
```

## 9. Generate: call the LLM

- **Provider chain:** `getChatProvider()` → **tracing decorator** (observation `llm.groq`, type
  `generation`, records the full prompt) → `GroqChatProvider.chat()` (`groq.ts`)
- Groq is OpenAI-compatible, so the official OpenAI SDK is used with Groq's URL:

```http
POST https://api.groq.com/openai/v1/chat/completions
Authorization: Bearer <GROQ_API_KEY>

{ "model": "openai/gpt-oss-120b", "messages": [system, user],
  "max_completion_tokens": 4096, "temperature": 0.2 }
```

- **Real numbers:** 646 input tokens, 257 output tokens, **1616 ms**.
- **Can go wrong:** SDK retries 429/5xx up to `LLM_MAX_RETRIES` with a `LLM_TIMEOUT_MS` timeout;
  then the error handler answers `503 rate_limited` or `502 upstream_error`.
- (With `LLM_PROVIDER=anthropic` the same call goes to Claude: no temperature, `effort` instead,
  refusal fallback.)

## 10. Post-process the answer

- **File:** `answer.ts`

1. `normaliseCitations()`: `【1】` / `【1†L5-L8】` → `[1]` (gpt-oss sometimes uses other brackets).
2. If the text contains the exact "not found" sentence (or the model refused) → `answered: false`.
3. `citedIds()`: find `[n]` markers that point to real sources → **citations** `[1]`, `[2]`.

## 11. Assemble the response and close the trace

- **Files:** `answer.ts`; contract `packages/shared/src/schemas/chat.ts` (`ChatResponse`)
- The chain observation is updated with the answer and citations; level **WARNING** if
  "not found" (easy to filter in Langfuse). The trace id becomes `traceId` + `traceUrl`.

```json
{
  "answer": "Tell the customer that the second charge is usually a temporary authorisation hold that clears on its own within **3–5 business days** [1]. If both charges are still showing after 5 business days, ask them to contact support with their order number so you can issue a refund for the duplicate charge within **2 business days** [1][2].",
  "answered": true,
  "citations": [
    { "id": 1, "section": "Charged twice" },
    { "id": 2, "section": "When to contact support" }
  ],
  "sources": ["... 4 sources with title, section, file, distance, text ..."],
  "model": "openai/gpt-oss-120b",
  "promptVersion": "answer-v2",
  "usage": { "inputTokens": 646, "outputTokens": 257, "embeddingTokens": 15 },
  "timings": { "retrievalMs": 1871, "generationMs": 1615, "totalMs": 3496 },
  "traceId": "b5ea784fe71fbd2596b7cf88fc73671b",
  "traceUrl": "https://cloud.langfuse.com/project/<project-id>/traces/b5ea784f..."
}
```

- Hono sends it back (`--> POST /chat 200 3s`) → the Next.js proxy passes it through → browser.
- **If anything threw:** `middleware/error-handler.ts` logs details on the server and returns a
  safe JSON error (`503` / `502` / `500`), never a stack trace.

## 12. Browser: render

- **Files:** `chat-panel.tsx`, `answer-text.tsx`
- The turn becomes `done`; the input is enabled again.
- `AnswerText` turns the text into **React elements** (paragraphs, lists, **bold**, `[n]` buttons).
  No raw HTML is ever inserted, so model output cannot run scripts (XSS-safe).
- **Source chips:** `[1] Charged twice` (blue = cited), `[3] Wrong amount` (grey = retrieved, not
  cited). The source panel opens on citation [1].
- **Meta line:** `openai/gpt-oss-120b · 646/257 tokens · 3496 ms · answer-v2 · view trace ↗`.
- **"Not found"** answers are shown in **amber** with the label "Not in the help centre".

## 13. In the background: the trace goes to Langfuse

- **File:** `apps/api/src/instrumentation.ts` (`LangfuseSpanProcessor`)
- Finished spans are **batched** and sent to Langfuse Cloud a moment after the response.
  If Langfuse is down, the trace is lost but **the user already has the answer** (best-effort).

```
rag-answer    CHAIN       0 → 3502 ms
├─ retrieve   RETRIEVER   5 → 1877 ms
│  └─ embed.voyage EMBEDDING   7 → 1617 ms   15 tokens
│     (Postgres search ≈ 255 ms, inside retrieve)
└─ llm.groq   GENERATION  1883 → 3499 ms     646 in / 257 out
```

---

## Where the 3.5 seconds go

| Step                                          | Time        | Share |
| --------------------------------------------- | ----------- | ----- |
| Validation, proxy, prompt building, rendering | ~10–20 ms   | < 1%  |
| Embed question (Voyage)                       | 1610 ms     | 46%   |
| Vector search (Postgres)                      | ~255 ms     | 7%    |
| LLM answer (Groq gpt-oss-120b)                | 1616 ms     | 46%   |
| **Total**                                     | **3496 ms** |       |

Repeat questions skip the 1610 ms embedding (cache). Off-topic questions skip the LLM.

## All the decision points

| Decision                          | Where                  | Outcome                                    |
| --------------------------------- | ---------------------- | ------------------------------------------ |
| Input valid?                      | `routes/chat.ts` (Zod) | No → 400, no AI cost                       |
| Question embedding cached?        | `retriever.ts`         | Yes → no Voyage call                       |
| Embedding API error?              | `voyage.ts`            | 429/5xx → retry with backoff; 4xx → fail   |
| Any chunk with distance ≤ 0.70?   | `answer.ts`            | No → "not found", no LLM call              |
| Model says "not found" / refuses? | `answer.ts`            | `answered: false`, amber UI, WARNING trace |
| Citations point at real sources?  | `answer.ts`            | Only valid `[n]` become buttons            |
| Any error thrown?                 | `error-handler.ts`     | Safe 503 / 502 / 500 JSON; red UI message  |
| Langfuse reachable?               | `instrumentation.ts`   | No → trace dropped, answer unaffected      |

## Debug checklist (when an answer looks wrong)

1. Click **view trace ↗**.
2. `retrieve` output: were the right chunks found, and how far (distance)? If not → knowledge
   base or chunking problem (step 08).
3. `llm.groq` input: did the prompt contain the right sources? Output: did the model ignore them?
   → prompt problem (step 09/10).
4. Level WARNING with good sources → over-refusal (prompt). Correct sources but wrong number →
   check "copy numbers exactly" and the source text.
5. Run `pnpm kb:check` to make sure retrieval as a whole still works.
