# Step 07 (Task 3.2): LLM providers (chat + embeddings)

## 1. Goal

One small interface for "talk to a model" (`chat`) and "turn text into vectors" (`embed`), so the
rest of the app never depends on a vendor. Switching vendor = change `.env`, not code.

## 2. What we built

| File                                                  | What                                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/ai/src/providers/types.ts`                  | Interfaces: `ChatProvider.chat()`, `EmbeddingProvider.embed()`                                 |
| `packages/ai/src/providers/anthropic.ts`              | Claude chat (official `@anthropic-ai/sdk`): effort, refusal fallback                           |
| `packages/ai/src/providers/groq.ts`                   | Groq chat (open models, free tier) via the OpenAI SDK + Groq base URL                          |
| `packages/ai/src/providers/voyage.ts`                 | Voyage AI embeddings (free tokens) via `fetch`, with timeout + retries                         |
| `packages/ai/src/providers/openai.ts`                 | OpenAI embeddings (official `openai` SDK)                                                      |
| `packages/ai/src/providers/index.ts`                  | Factory: `getChatProvider()`, `getEmbeddingProvider()` from `.env`                             |
| `packages/ai/scripts/smoke.ts`                        | Live test: embeddings similarity + one triage answer (`pnpm ai:smoke`)                         |
| `packages/db/migrations/0002_embedding_dims_1024.sql` | `vector(1536)` → `vector(1024)` for Voyage                                                     |
| `packages/shared/src/config.ts`, `.env.example`       | New settings: `LLM_EFFORT`, `LLM_REFUSAL_FALLBACK`, `EMBEDDING_PROVIDER`, `GROQ_*`, `VOYAGE_*` |

Current setup (all free): **chat = Groq** (`llama-3.3-70b-versatile`), **embeddings = Voyage**
(`voyage-4`, 1024 dims). Claude is one `.env` change away (`LLM_PROVIDER=anthropic` + Claude model names).

## 3. Why this way

- **Provider interface (adapter pattern)**: callers depend on `chat()` / `embed()`, not on vendor
  SDKs. This paid off **in the same step**: both paid accounts had no credit, so we added Voyage
  and Groq without changing any caller.
- **Chat and embeddings are separate choices**: Anthropic has no embeddings API, and the best
  chat model and the best embedding model often come from different vendors.
- **Official SDKs where they exist** (Anthropic, OpenAI): they handle retries, timeouts, types and
  errors. Groq is OpenAI-compatible, so the OpenAI SDK works with a different `baseURL`. Voyage is
  one endpoint, so plain `fetch` + our own retry is enough.
- **Effort instead of temperature for Claude**: current Claude models reject `temperature` (400).
  `effort` (`low`…`max`) controls how much the model thinks: quality vs cost/latency.
- **max tokens includes thinking**: 1024 could cut answers off; raised to 4096.
- **Refusal fallback** (Claude, `fallbacks: 'default'`): if a request is declined for safety,
  the API retries on another model in the same call. Not available on Claude Haiku.
- **`inputType: 'query' | 'document'`**: Voyage adds a retrieval hint per type. Questions are
  embedded as `query`, knowledge-base chunks as `document`: better matches.
- **Guard on vector size**: every provider checks the vector length equals `EMBEDDING_DIMENSIONS`,
  so a wrong model fails loudly instead of breaking inserts later.
- **Retries only for retryable errors**: 429/5xx/network = retry with exponential backoff
  (0.5s, 1s, 2s); 400/401/403 = fail immediately (retrying can't fix them).
- **Lazy singletons**: providers are created on first use, once.

## 4. How it works

```
caller (RAG, agent, API)
  -> getChatProvider()            reads LLM_PROVIDER       -> AnthropicChatProvider | GroqChatProvider
  -> getEmbeddingProvider()       reads EMBEDDING_PROVIDER -> VoyageEmbeddingProvider | OpenAIEmbeddingProvider
  -> chat({ system, messages, tier: 'chat'|'cheap'|'judge' })  -> { text, model, usage, latencyMs, refused }
  -> embed(texts, { inputType })                               -> { vectors[], usage, latencyMs }
```

Model tiers: `chat` (main answers), `cheap` (classification/routing), `judge` (evals). Names come
from `MODEL_CHAT`, `MODEL_CHEAP`, `MODEL_JUDGE` for the active provider.

## 5. Try it yourself

```bash
# add GROQ_API_KEY and VOYAGE_API_KEY to .env first
pnpm ai:smoke        # real calls, free tier
pnpm db:smoke        # vector size now 1024
# switch to Claude later (needs Anthropic credit):
#   LLM_PROVIDER=anthropic, MODEL_CHAT=claude-sonnet-5-5, MODEL_CHEAP=claude-haiku-5-5, MODEL_JUDGE=claude-opus-5-5
```

## 6. Problems we faced

| Problem                                          | Cause                                                    | Fix                                                                     | Lesson                                                                          |
| ------------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `LLM_TEMPERATURE` would break Claude calls       | Current Claude models reject `temperature` (API changed) | Don't send it to Claude; use `effort`. Keep temperature for open models | APIs drift; check current docs, not memory                                      |
| `LLM_MAX_OUTPUT_TOKENS=1024` too low             | Thinking tokens count toward the limit                   | 4096                                                                    | Budget tokens for thinking + answer                                             |
| OpenAI: `429 credit_balance_exhausted`           | Account has no credit (billing), **not** a rate limit    | Switched embeddings to Voyage (free tokens)                             | Read the error `code`, not only the status; the SDK retried a non-retryable 429 |
| Anthropic: `400 credit balance is too low`       | Account has no credit                                    | Chat via Groq free tier for now                                         | A 400/429 can be billing; keys were valid (no 401)                              |
| Chat test never ran after embeddings failed      | One `await` chain: first failure stopped the script      | Run each test separately and report each                                | Tests should not hide each other's results                                      |
| "Can I use another account for free credit?"     | —                                                        | No: against terms, accounts get linked and banned. Use real free tiers  | Free tiers exist; account farming is not one                                    |
| Embedding size changed 1536 → 1024               | Voyage uses 1024                                         | Migration `0002` (table was empty, so safe)                             | Changing the embedding model = migration + re-embed                             |
| `db:smoke` had `1536` hardcoded                  | Broke the "no hardcoded settings" rule                   | Read `config.llm.embeddingDimensions`                                   | Hardcoded values hide until something changes                                   |
| Voyage main docs page lacked the response format | Docs split across pages                                  | Read the API reference page                                             | Verify field names in the reference docs                                        |

## 7. Interview questions

**Q: Why put LLM vendors behind an interface?**
Avoid lock-in, switch on price/quality/outage, test with fakes, run different vendors per task
(chat vs embeddings). We switched both vendors in one step without touching callers.

**Q: Which errors do you retry?**
Rate limits (429 _rate_), timeouts, 5xx and network errors, with exponential backoff and a cap.
Not 400/401/403/404, and not quota/billing 429s: they won't fix themselves.

**Q: Temperature vs effort?**
Temperature changes randomness of token choice. Effort (Claude) changes how much the model thinks
before answering: more effort = better on hard tasks, more tokens, more latency.

**Q: Why `query` vs `document` embeddings?**
Asymmetric retrieval: short questions and long passages look different. Some models embed them
with different hints so questions land near the passages that answer them.

**Q: Free tiers: any risks?**
Rate limits, changing terms, and some providers may train on your data. Fine for public docs and
learning; not for real customer PII without a data agreement.

**Q: How do you track LLM cost?**
Log input/output tokens per call (we return `usage`), multiply by the model price, aggregate per
request and per day (Langfuse does this), and enforce a budget (`DAILY_BUDGET_USD`, task 8).

## 8. Key takeaways

- Depend on interfaces, not vendors.
- Read error codes carefully: billing ≠ rate limit ≠ bad key.
- Embedding model, vector size and database column must always match.
