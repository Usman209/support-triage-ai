# Interview questions (all steps)

Short answers you can say in 30–60 seconds. Practise saying them out loud.
Tip: a strong answer has **what**, **why**, and **a trade-off**.

## Architecture and tooling

1. **Why a monorepo?** Shared types and config change together with the apps. One install, one CI,
   safe cross-package changes. Trade-off: CI speed at scale (fix with caching / affected-only builds).
2. **Why pnpm?** Fast, disk-efficient, strict dependency access.
3. **Why strict TypeScript for AI apps?** Model output and external data are unpredictable; strict
   types plus runtime validation catch bugs early.
4. **Why separate `packages/ai` from `apps/api`?** Separation of concerns; reuse in scripts; test
   without HTTP.
5. **What is a walking skeleton?** The thinnest end-to-end running version; add features to a
   working system.

## Configuration and security

6. **Where do you keep API keys?** Env variables; `.env` locally (gitignored); secret manager in prod.
7. **Why validate config at startup?** Fail fast with a clear message.
8. **What is `.env.example` for?** Documents every variable with safe placeholders; committed.
9. **A secret was committed. What now?** Rotate first, then clean history, then add secret scanning.
10. **Why Zod?** Runtime validation + TypeScript type from one schema.
11. **What is least privilege?** Each identity gets only the permissions it needs.

## Infrastructure

12. **Why pgvector instead of a vector DB?** One database, SQL joins, transactions, known backups;
    scales to millions of vectors with HNSW. Dedicated vector DB for very large scale.
13. **What is S3-compatible storage?** Same API as Amazon S3; change the endpoint, not the code.
14. **What is an idempotent script?** Same result no matter how many times it runs.
15. **Liveness vs readiness?** Alive vs able to serve traffic now (dependencies OK).
16. **Why pin Docker image versions?** Reproducible builds; upgrade on purpose.

## Observability

17. **What is LLM observability?** Traces of each request with prompt, output, tokens, cost,
    latency, errors and scores.
18. **Trace vs span?** Trace = whole request; spans = steps inside it.
19. **Cloud or self-hosted observability?** Depends on data rules; redact PII, choose region, or self-host.
20. **Which production metrics matter?** p50/p95 latency, cost per request/day, error rate, tokens,
    retrieval quality, user feedback, eval scores.

## Web and API

21. **Server vs Client Components?** Server: secrets, data fetching, HTML only. Client: interactivity.
22. **Why Hono?** TypeScript-first, web standards, multi-runtime, streaming helpers.

## Discovery and product (step 05)

23. **How do you start a Gen AI project?** Discovery: user, pain, one metric with baseline, AI
    permissions, risks, scope. Then a small version, then measure.
24. **Why not auto-send AI replies?** Risk; start human-in-the-loop, measure, automate only proven-safe cases.
25. **North-star vs supporting metrics?** One value metric; guardrail metrics stop "cheating" it.
26. **Which actions need approval?** Decide by impact and reversibility: read = free, write =
    approval, irreversible = not allowed.
27. **What is automation bias?** Over-trusting the AI; reduce with citations, confidence, edit/reject tracking.

## RAG storage (step 06)

28. **Why store embeddings in Postgres?** One DB for app data and vectors: joins, transactions,
    backups, access control; HNSW scales to millions of vectors.
29. **HNSW vs IVFFlat?** HNSW: better recall/speed, no training, more memory. IVFFlat: faster build,
    less memory, needs data first, lower recall.
30. **Cosine vs L2 vs inner product?** Cosine = direction (meaning), standard for text; inner
    product = cosine for normalised vectors; L2 = straight-line distance.
31. **What if you change the embedding model?** Vectors aren't comparable across models: new
    migration for the size and re-embed everything. Store the model name in metadata.
32. **Why migrations?** Reproducible, reviewed, ordered schema changes with history.
33. **Why cascade delete chunks?** Deleted articles must not be retrievable; stale chunks cause wrong answers.

## LLM providers (step 07)

34. **Why an interface over LLM vendors?** No lock-in, switch on price/quality/outage, fakes in
    tests, different vendors per task. We switched both vendors without touching callers.
35. **Which errors do you retry?** 429 rate limits, timeouts, 5xx, network: exponential backoff
    with a cap. Never 400/401/403/404 or billing/quota errors.
36. **Temperature vs effort?** Temperature = randomness of token choice. Effort (Claude) = how much
    the model thinks: quality vs tokens and latency.
37. **Query vs document embeddings?** Asymmetric retrieval: different hints for short questions and
    long passages so questions land near the passages that answer them.
38. **Risks of free tiers?** Rate limits, changing terms, possible training on your data: fine for
    public docs, not for customer PII without an agreement.
39. **How do you track LLM cost?** Log tokens per call, multiply by price, aggregate per request/day,
    enforce a budget.

## RAG ingestion (step 08)

40. **How do you choose chunk size?** Precision vs context trade-off; split on structure, add
    overlap, measure with a retrieval eval.
41. **Why chunk overlap?** Text cut at a boundary still appears whole in one chunk.
42. **What is contextual chunking?** Add title/section (or a summary) to each chunk before embedding.
43. **How do you keep vectors in sync with documents?** Content hashes, upserts by stable id,
    delete+insert chunks in a transaction, prune deleted documents.
44. **When must you re-embed everything?** When the embedding model, vector size or chunking changes.
45. **What is hit@k / recall@k?** Share of test questions with a correct document in the top k.
46. **Labels turn out to be random. Now what?** Don't evaluate against them; build a trusted
    labelled set and tell stakeholders.

## RAG answering (step 09)

47. **How do you stop RAG hallucinations?** Relevance filter, answer only from sources, citations,
    allowed "not found", groundedness evals, human review.
48. **Why skip the LLM when nothing is relevant?** Any answer would be invented; also saves cost/latency.
49. **How do you pick top-k and a threshold?** Measure distance distributions, pick a gap, validate
    with hit@k.
50. **Prompt injection in RAG?** Treat sources/input as delimited data, limit model powers, validate
    citations, add detection (task 8).
51. **Why version prompts?** Compare in evals/traces and roll back.

## Chat UI (step 10)

52. **Why proxy chat through the web server?** Same origin (no CORS), internal URL/secrets stay
    server-side, one place for auth and rate limits (BFF).
53. **How do you render LLM output safely?** Never as raw HTML; parse to elements or sanitise.
54. **What makes AI answers trustworthy for agents?** Clickable sources, clear not-found, visible
    errors, human sends the reply.
55. **What is over-refusal?** Saying "I don't know" although sources answer; fix + regression set.
56. **Why cache query embeddings?** Repeated questions; saves latency and cost; LRU bounds memory.

## Tracing (step 11)

57. **Logging vs tracing?** Logs are separate lines; a trace links all steps of one request with
    timing and parent/child structure.
58. **How do you trace an LLM app?** One trace per request; spans for retrieval, embedding, LLM,
    tools; record model, prompt, output, tokens, latency, errors; tag prompt version.
59. **Why OpenTelemetry?** Vendor-neutral: instrument once, export anywhere, join with HTTP/DB spans.
60. **Tracing backend down?** Export in the background, never block or fail the request.
61. **PII in traces?** Mask before export, restrict access, choose region and retention.

## Agent safety and data model (step 12)

62. **How do you make an agent safe on real systems?** Propose vs do: proposals with rationale,
    human approval, validated execution, audit, dangerous actions not in the allow-list.
63. **Tamper-proof audit log?** Append-only in the database (triggers/permissions), no cascade,
    ordered ids; stronger: write-once storage or hash chains.
64. **Why store proposals in a table?** Approval happens later by someone else; needs state,
    listing, expiry, history, survival across restarts.
65. **Why expire proposals?** Avoid applying decisions based on stale information.

## Loading customer data (step 13)

66. **Load customer data responsibly?** Allow-list fields, redact PII in free text, raw files out
    of git, document removals, verify with checks.
67. **Allow-list or deny-list columns?** Allow-list: new source columns are excluded by default.
68. **Idempotent data load?** Stable key + upsert; report inserted vs updated.
69. **Why not overwrite all fields on re-load?** Other processes own some fields (approved actions).
70. **Regex PII redaction enough?** First line only; production uses PII detectors before LLM/logs.

<!-- New questions are added here as each task is built (RAG, agent, evals, security, deployment, monitoring). -->
