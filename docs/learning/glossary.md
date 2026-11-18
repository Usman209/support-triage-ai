# Glossary (simple meanings)

| Term                             | Simple meaning                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **LLM**                          | Large Language Model. A model that reads and writes text (Claude, GPT).                                |
| **Prompt**                       | The text instructions and data we send to the LLM.                                                     |
| **Token**                        | A small piece of text (about 3–4 characters). Models are priced and limited by tokens.                 |
| **Temperature**                  | How random the output is. 0 = most predictable. We use 0.2.                                            |
| **Embedding**                    | A list of numbers (a vector) that represents the meaning of a text. Similar meaning = close vectors.   |
| **Vector / dimensions**          | The list of numbers; its length (1536 for `text-embedding-3-small`).                                   |
| **pgvector**                     | Postgres extension that stores vectors and finds the closest ones.                                     |
| **RAG**                          | Retrieval-Augmented Generation: find relevant documents first, then let the LLM answer using them.     |
| **Chunk**                        | A small piece of a document (we use ~800 characters) that we embed and search.                         |
| **Top-K**                        | How many chunks we retrieve (8).                                                                       |
| **Reranker**                     | A second model that re-orders retrieved chunks by relevance; we keep the best N (4).                   |
| **Agent**                        | An LLM that can call tools (functions) in steps to reach a goal.                                       |
| **Tool**                         | A function the agent may call, e.g. "update ticket priority".                                          |
| **Human-in-the-loop / approval** | A person must approve risky actions before they run.                                                   |
| **Guardrails**                   | Checks around the LLM: PII redaction, prompt-injection detection, output validation.                   |
| **PII**                          | Personally Identifiable Information: names, emails, phone numbers, addresses.                          |
| **Prompt injection**             | Text that tries to make the LLM ignore its instructions ("ignore previous rules...").                  |
| **Evals**                        | Automated tests for AI quality (is the answer correct, grounded, safe?).                               |
| **LLM-as-judge**                 | Using a strong model to grade another model's answers.                                                 |
| **Observability / tracing**      | Recording what happened in each request so you can debug and measure.                                  |
| **Trace / span**                 | Trace = one full request; span = one step inside it.                                                   |
| **Langfuse**                     | LLM observability tool (traces, costs, prompt versions, scores).                                       |
| **Monorepo**                     | One git repository with many apps and packages.                                                        |
| **Workspace (pnpm)**             | pnpm feature that links the packages of a monorepo together.                                           |
| **Zod**                          | Library to validate data at runtime and get TypeScript types.                                          |
| **Docker Compose**               | Tool to run several containers together from one YAML file.                                            |
| **Healthcheck**                  | A command Docker runs to know if a container is OK.                                                    |
| **MinIO / S3**                   | Object (file) storage with the Amazon S3 API.                                                          |
| **Bucket / object**              | Bucket = a top-level folder in S3; object = a file in it.                                              |
| **Policy**                       | JSON rules that say who can do which action on which resource.                                         |
| **Least privilege**              | Give only the permissions needed, nothing more.                                                        |
| **Idempotent**                   | Running it again gives the same result.                                                                |
| **Hono**                         | Small, fast TypeScript web framework for APIs.                                                         |
| **Next.js App Router**           | React framework; pages are folders under `src/app`.                                                    |
| **Server Component**             | React component rendered on the server; can use secrets safely.                                        |
| **CI**                           | Continuous Integration: automatic checks on every push (GitHub Actions).                               |
| **Walking skeleton**             | Thinnest end-to-end working version of the system.                                                     |
| **ORM (Drizzle)**                | Library that maps tables to code: typed queries instead of raw SQL strings.                            |
| **Migration**                    | A numbered SQL file that changes the database schema; applied in order, tracked in the DB.             |
| **Foreign key / cascade**        | A column pointing to another table's row; cascade = delete children with the parent.                   |
| **Cosine distance (`<=>`)**      | How different two vectors' directions are: 0 = same meaning, 1 = unrelated, 2 = opposite.              |
| **ANN / HNSW index**             | Approximate Nearest Neighbour search; HNSW is a graph index that finds close vectors fast.             |
| **Transaction / rollback**       | A group of DB changes that all succeed or all get undone (rollback).                                   |
| **Smoke test**                   | A quick test that the basic path works end to end.                                                     |
| **Provider / adapter pattern**   | One interface in front of several vendors; the app calls the interface, not the vendor.                |
| **SDK**                          | A vendor's official library for its API (handles auth, retries, types).                                |
| **OpenAI-compatible API**        | An API that copies OpenAI's request format, so the OpenAI SDK works with a different base URL (Groq).  |
| **Effort**                       | Claude setting for how much the model thinks before answering (low → max).                             |
| **Exponential backoff**          | Wait longer after each failed try (0.5s, 1s, 2s...) before retrying.                                   |
| **Rate limit vs quota**          | Rate limit = too many requests now (wait). Quota/credit = no budget left (pay or switch).              |
| **Refusal fallback**             | If a model declines for safety reasons, the request is retried on another model.                       |
| **Query / document embedding**   | Different embedding hints for a search question vs a stored passage.                                   |
| **Voyage AI / Groq**             | Voyage: embeddings vendor (free tokens). Groq: fast hosting of open models (free tier).                |
| **Ingestion**                    | Loading source documents into the search index: parse, chunk, embed, store.                            |
| **Chunk overlap**                | Characters repeated between neighbouring chunks so boundary sentences stay whole.                      |
| **Contextual header**            | "Title > Section" added to each chunk so it keeps its meaning alone.                                   |
| **Fingerprint / content hash**   | A hash that changes when the content (or settings) change; used to skip unchanged work.                |
| **Upsert**                       | Insert a row, or update it if it already exists (by a unique key).                                     |
| **Prune**                        | Delete index entries whose source no longer exists.                                                    |
| **hit@k**                        | Share of test questions whose correct document is in the top k results.                                |
| **Ground truth**                 | Trusted correct answers used to score a system.                                                        |
| **Retriever**                    | Finds the chunks most similar to a question (vector search).                                           |
| **Reranker**                     | Re-orders retrieved chunks by relevance and keeps the best few.                                        |
| **Relevance threshold**          | Max distance for a chunk to count as relevant (RAG_MAX_DISTANCE).                                      |
| **Grounded answer**              | An answer supported by the provided sources, with citations.                                           |
| **Citation**                     | A [n] marker linking a statement to a numbered source.                                                 |
| **API contract**                 | The agreed request/response shape (our Zod schema + types).                                            |
| **BFF (backend for frontend)**   | A small server route owned by the web app that calls internal APIs for the browser.                    |
| **CORS**                         | Browser rule that blocks calls to another origin unless that server allows it.                         |
| **XSS**                          | Cross-site scripting: injected HTML/JS running in the page; avoided by never rendering untrusted HTML. |
| **Over-refusal**                 | The model says "not found" although the sources answer the question.                                   |
| **Regression test**              | Re-running known cases after a change to make sure nothing that worked broke.                          |
| **LRU cache**                    | Keeps recent items, drops the least-recently-used when full.                                           |
| **Deep link**                    | A URL that opens a specific state, e.g. /chat?q=... asks that question.                                |
| **Trace / observation**          | Trace = one request; observations = its steps (chain, retriever, embedding, generation).               |
| **OpenTelemetry (OTel)**         | Open standard for traces/metrics; instrument once, send to any backend.                                |
| **Span processor / exporter**    | Component that batches finished spans and sends them to a backend.                                     |
| **Context propagation**          | The active span is carried automatically so child steps nest correctly.                                |
| **Decorator**                    | A wrapper that adds behaviour (tracing) to an object without changing its callers.                     |
| **Best-effort**                  | Tried but not guaranteed; failure must not affect the main work.                                       |
| **Human in the loop**            | A person must approve before an AI action takes effect.                                                |
| **Approval queue**               | List of pending proposed actions waiting for a human decision.                                         |
| **Append-only**                  | New rows may be added; existing rows can never be changed or deleted.                                  |
| **Trigger**                      | Database code that runs automatically on INSERT/UPDATE/DELETE (here: blocks changes).                  |
| **Enum**                         | A column type that only accepts a fixed list of values.                                                |
| **Savepoint**                    | A point inside a transaction you can roll back to without losing the whole transaction.                |
| **Data minimisation**            | Store only the personal data you actually need (GDPR principle).                                       |
