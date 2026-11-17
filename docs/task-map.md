# Task map

Status: `[ ]` not started, `[~]` in progress, `[x]` done.

- [x] **0. Skeleton**: monorepo structure, tooling, config loader, placeholders
- [x] **0b. Starter app**: API `/health` + web shell (ports 3010/3011)
- [~] **1. Discovery**: `docs/discovery-brief.md` drafted with assumptions; data findings added (CSV labels are random → own labelled test set in task 7)
- [~] **3. RAG**: ingest knowledge base, chunk + embed into pgvector, retrieval + reranking, cited answers
  - [x] 3.1 Database tables `documents` + `chunks` (vector, HNSW cosine; 1024 dims since 3.2), migrations, `pnpm db:smoke`
  - [x] 3.2 LLM providers: interface + Groq chat / Voyage embeddings (free), Claude + OpenAI ready; `pnpm ai:smoke`
  - [x] 3.3 Ingestion: 16 sample articles → 74 chunks, idempotent + prune; `pnpm ingest`, `pnpm kb:check` (hit@1 16/16)
  - [x] 3.4 Retrieval + `POST /chat` with citations, "not found" threshold (RAG_MAX_DISTANCE=0.70), versioned prompt
  - [ ] 3.5 Chat UI
  - [ ] 3.6 Langfuse tracing
- [ ] **4. Agent**: approval-gated triage agent, tool registry, approval queue UI and API
- [ ] **7. Evals**: promptfoo datasets and assertions, CI eval step
- [ ] **8. Security**: PII redaction, prompt-injection checks, auth (OIDC), rate limits, red-teaming
- [ ] **9. Deployment**: Docker images, Terraform (AKS, ACR, Postgres), Helm chart, CD pipeline
- [ ] **10. Monitoring**: Langfuse traces, OpenTelemetry, cost and quality dashboard, alerts
- [ ] **P1. RAG metrics**: Ragas / DeepEval in `services/py-evals`
- [ ] **P2. Document parsing**: Docling in `services/py-doc-parser`

Learning notes for each step: [docs/learning/](learning/README.md)
