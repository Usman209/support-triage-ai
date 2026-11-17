# Step 10 (Task 3.5): Chat UI

## 1. Goal

Let a support agent ask questions in the browser and **check** every answer: clickable citations
open the source text, and "not found" is clearly different from an answer.

## 2. What we built

| File                                           | What                                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/web/src/app/api/chat/route.ts`           | Server-side proxy: browser → Next.js `/api/chat` → API `/chat`                           |
| `apps/web/src/components/chat/chat-panel.tsx`  | Chat (client component): history, examples, loading/error/not-found states, source panel |
| `apps/web/src/components/chat/answer-text.tsx` | Safe renderer: paragraphs, lists, **bold**, `[n]` citation buttons (no raw HTML)         |
| `apps/web/src/app/chat/page.tsx`               | Page; `?q=` deep link asks a question from the URL                                       |
| `apps/web/src/app/globals.css`                 | Chat styles, light/dark, stacks on narrow screens                                        |
| `packages/ai/src/prompts/answer.prompt.ts`     | **Prompt `answer-v2`**: general guidance allowed (fixes over-refusal)                    |
| `packages/ai/src/rag/retriever.ts`             | In-memory LRU cache for query embeddings                                                 |

Open **http://localhost:3010/chat** (needs `pnpm dev:api` and `pnpm dev:web`).
Deep link example: `http://localhost:3010/chat?q=How long do card refunds take?`

## 3. Why this way

- **Proxy route in the web app ("backend for frontend")**: the browser calls its own origin, so no
  CORS setup, the API address stays on the server, and later we can add auth/session checks in one
  place.
- **Citations are buttons, sources are visible**: agents must verify before they reply to a
  customer. Cited sources are highlighted; retrieved-but-not-cited ones are grey, so you can see
  what the model ignored.
- **"Not found" looks different** (amber, labelled): an honest "I don't know" must not look like an
  answer.
- **Meta line** (model · tokens · ms · prompt version): makes cost, speed and prompt changes visible
  during development.
- **Safe rendering of model output**: LLM text is untrusted. We turn it into React elements (no
  `dangerouslySetInnerHTML`), so a prompt-injected `<script>` or `<img onerror>` is shown as text.
- **One question = one request (no memory yet)**: simpler and cheaper; the UI says so. Conversation
  memory is a later feature.
- **Prompt v2 + regression test**: fixing one failure (over-refusal) can break other cases, so we
  re-ran all known cases after the change.
- **Query-embedding cache**: identical questions skip the embedding API (0 tokens, ~4 ms).

## 4. How it works

```
Browser (chat-panel.tsx)
  POST /api/chat {question}            same origin, no CORS
Next.js route (server)
  POST {API_URL}/chat                  API address from config, never sent to the browser
Hono API -> answerQuestion()           retrieve (cache) -> threshold -> LLM -> citations
Browser renders: answer (AnswerText) + chips [1][2] + meta; click -> source panel
```

## 5. Try it yourself

1. Open http://localhost:3010/chat and click an example question.
2. Click a citation `[1]`: the source panel shows the exact article section.
3. Ask something not covered ("Do you ship to Canada?"): amber **Not in the help centre**.
4. Stop the API (Ctrl+C in its terminal) and ask again: a red error appears with a clear message.
5. Press F12 → device toolbar → pick a phone: the source panel moves under the chat.
6. Ask the same question twice and compare the meta line timing (embedding cache).

## 6. Problems we faced

| Problem                                                               | Cause                                                                                                                    | Fix                                                                                      | Lesson                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Browser → API on another port needs CORS                              | Different origins (3010 vs 3011)                                                                                         | Next.js route `/api/chat` proxies server-side                                            | A small BFF avoids CORS and hides internal URLs                   |
| Model output could contain HTML                                       | LLM text is untrusted (prompt injection)                                                                                 | Render as React elements, never raw HTML                                                 | Treat model output like user input (XSS)                          |
| Source panel showed `**bold**`, hard line breaks and a repeated title | Raw chunk text shown in a `<pre>`                                                                                        | Reuse the safe renderer with `softWrap`; drop the header line                            | Display stored text for humans, not as stored                     |
| "Set up a new Amazon Echo?" → "not found"                             | Prompt v1 too strict: the article is generic (doesn't name Echo) — **over-refusal**                                      | Prompt `answer-v2`: use general guidance and say it's general; regression-tested 5 cases | Fixing hallucination can cause over-refusal; test both directions |
| One answer took 24 s                                                  | Voyage free tier 429 → our retry waited 20 s (worked)                                                                    | Query-embedding cache; option: add a payment method in Voyage (free tokens still apply)  | Retries hide errors but cost latency; caching avoids calls        |
| Page wider than the screen in 400 px screenshots                      | Headless Edge has a minimum width (~500 px) and crops; also our `transform` widening trick could overflow on real phones | `main:has(.chat-layout)` instead of `transform`; verified home page shows the same crop  | Know your test tool's limits; check phones in DevTools            |
| Headless Edge hung                                                    | Two headless instances launched together                                                                                 | One at a time with a hard `timeout`                                                      | Give external tools timeouts                                      |
| `eslint-disable react-hooks/...` would fail lint                      | Rule plugin not installed                                                                                                | Removed the comment                                                                      | Disable comments must reference real rules                        |

## 7. Interview questions

**Q: Why proxy chat requests through the web server?**
Same-origin calls (no CORS), internal API URL and secrets stay server-side, one place for auth,
rate limiting and logging (backend-for-frontend pattern).

**Q: How do you render LLM output safely?**
Never inject it as HTML. Parse a small Markdown subset into elements or use a sanitising Markdown
renderer. LLM output can be attacker-controlled through prompt injection.

**Q: What UX makes AI answers trustworthy for agents?**
Visible, clickable sources; a clear "not found" state; no hidden failures (errors shown); metadata
for debugging; the human sends the final reply.

**Q: What is over-refusal and how did you fix it?**
The model says "I don't know" although the sources answer the question. We relaxed the prompt for
general guidance (v2) and re-ran a regression set covering answerable, unanswerable and injection
questions.

**Q: Why cache query embeddings?**
Repeated questions are common (FAQs, retries, tests). A cache keyed by model + normalised text
removes latency and API cost; LRU eviction bounds memory. A shared cache (e.g. Redis) is the
multi-instance version.

## 8. Key takeaways

- Show sources and make "not found" obvious: the agent decides.
- LLM output is untrusted input for the UI.
- Every prompt fix needs a regression run.
