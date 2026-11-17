# Glossary (simple meanings)

| Term                             | Simple meaning                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **LLM**                          | Large Language Model. A model that reads and writes text (Claude, GPT).                              |
| **Prompt**                       | The text instructions and data we send to the LLM.                                                   |
| **Token**                        | A small piece of text (about 3–4 characters). Models are priced and limited by tokens.               |
| **Temperature**                  | How random the output is. 0 = most predictable. We use 0.2.                                          |
| **Embedding**                    | A list of numbers (a vector) that represents the meaning of a text. Similar meaning = close vectors. |
| **Vector / dimensions**          | The list of numbers; its length (1536 for `text-embedding-3-small`).                                 |
| **pgvector**                     | Postgres extension that stores vectors and finds the closest ones.                                   |
| **RAG**                          | Retrieval-Augmented Generation: find relevant documents first, then let the LLM answer using them.   |
| **Chunk**                        | A small piece of a document (we use ~800 characters) that we embed and search.                       |
| **Top-K**                        | How many chunks we retrieve (8).                                                                     |
| **Reranker**                     | A second model that re-orders retrieved chunks by relevance; we keep the best N (4).                 |
| **Agent**                        | An LLM that can call tools (functions) in steps to reach a goal.                                     |
| **Tool**                         | A function the agent may call, e.g. "update ticket priority".                                        |
| **Human-in-the-loop / approval** | A person must approve risky actions before they run.                                                 |
| **Guardrails**                   | Checks around the LLM: PII redaction, prompt-injection detection, output validation.                 |
| **PII**                          | Personally Identifiable Information: names, emails, phone numbers, addresses.                        |
| **Prompt injection**             | Text that tries to make the LLM ignore its instructions ("ignore previous rules...").                |
| **Evals**                        | Automated tests for AI quality (is the answer correct, grounded, safe?).                             |
| **LLM-as-judge**                 | Using a strong model to grade another model's answers.                                               |
| **Observability / tracing**      | Recording what happened in each request so you can debug and measure.                                |
| **Trace / span**                 | Trace = one full request; span = one step inside it.                                                 |
| **Langfuse**                     | LLM observability tool (traces, costs, prompt versions, scores).                                     |
| **Monorepo**                     | One git repository with many apps and packages.                                                      |
| **Workspace (pnpm)**             | pnpm feature that links the packages of a monorepo together.                                         |
| **Zod**                          | Library to validate data at runtime and get TypeScript types.                                        |
| **Docker Compose**               | Tool to run several containers together from one YAML file.                                          |
| **Healthcheck**                  | A command Docker runs to know if a container is OK.                                                  |
| **MinIO / S3**                   | Object (file) storage with the Amazon S3 API.                                                        |
| **Bucket / object**              | Bucket = a top-level folder in S3; object = a file in it.                                            |
| **Policy**                       | JSON rules that say who can do which action on which resource.                                       |
| **Least privilege**              | Give only the permissions needed, nothing more.                                                      |
| **Idempotent**                   | Running it again gives the same result.                                                              |
| **Hono**                         | Small, fast TypeScript web framework for APIs.                                                       |
| **Next.js App Router**           | React framework; pages are folders under `src/app`.                                                  |
| **Server Component**             | React component rendered on the server; can use secrets safely.                                      |
| **CI**                           | Continuous Integration: automatic checks on every push (GitHub Actions).                             |
| **Walking skeleton**             | Thinnest end-to-end working version of the system.                                                   |
| **ORM (Drizzle)**                | Library that maps tables to code: typed queries instead of raw SQL strings.                          |
| **Migration**                    | A numbered SQL file that changes the database schema; applied in order, tracked in the DB.           |
| **Foreign key / cascade**        | A column pointing to another table's row; cascade = delete children with the parent.                 |
| **Cosine distance (`<=>`)**      | How different two vectors' directions are: 0 = same meaning, 1 = unrelated, 2 = opposite.            |
| **ANN / HNSW index**             | Approximate Nearest Neighbour search; HNSW is a graph index that finds close vectors fast.           |
| **Transaction / rollback**       | A group of DB changes that all succeed or all get undone (rollback).                                 |
| **Smoke test**                   | A quick test that the basic path works end to end.                                                   |
