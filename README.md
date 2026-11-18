# support-triage-ai

A TypeScript-first Gen AI assistant that helps support teams triage tickets: it answers from the
help-centre knowledge base with **RAG**, proposes actions through an **approval-gated agent**, and is
measured with **evals** and **observability** from day one.

> Status: skeleton only. Folders, config and placeholders exist; no business logic yet.

## Folder map

| Path                     | Purpose                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `apps/web`               | Next.js (App Router) + shadcn/ui front end: chat, approvals, dashboard               |
| `apps/api`               | Hono API: routes (health, chat, tickets, approvals), services, middleware            |
| `packages/shared`        | Zod schemas, shared types, and the typed `config` loader (`src/config.ts`)           |
| `packages/ai`            | LLM layer: providers, prompts, tools, agents, RAG                                    |
| `packages/db`            | Drizzle schema and migrations for Postgres + pgvector                                |
| `services/py-evals`      | Python RAG metrics with Ragas / DeepEval (task P1)                                   |
| `services/py-doc-parser` | Python document parsing with Docling (task P2)                                       |
| `evals/promptfoo`        | promptfoo config, datasets and red-team suites                                       |
| `data/`                  | `raw/` (gitignored CSV), `sample/` (committed samples), `knowledge-base/` (RAG docs) |
| `infra/docker`           | docker-compose: Postgres (pgvector), MinIO; optional self-hosted Langfuse profile    |
| `infra/terraform`        | Azure IaC: AKS, ACR, Postgres (placeholder)                                          |
| `infra/helm`             | Helm chart skeleton for AKS                                                          |
| `docs/`                  | Discovery brief, architecture, runbook, task map                                     |
| `scripts/`               | seed, ingest and eval scripts (placeholders)                                         |
| `.github/workflows`      | CI: install, lint, typecheck                                                         |

## Requirements

- Node.js 22+ and pnpm 10 (Langfuse tracing needs Node 22) (`corepack enable`)
- Docker (for local Postgres and MinIO)
- A [Langfuse Cloud](https://cloud.langfuse.com) project for tracing (keys go in `.env`)
- Python 3.11+ (only for `services/`)

## Getting started

```bash
# 1. Create your local env file from the template, then fill in the blanks
cp .env.example .env

# 2. Install dependencies
pnpm install

# 3. Start local infrastructure (Postgres + MinIO)
pnpm infra:up
#    Optional: self-hosted Langfuse instead of Langfuse Cloud
#    pnpm infra:up:langfuse-local

# 4. Checks
pnpm lint
pnpm format:check
pnpm typecheck
```

## Configuration rules

- Every credential and every tunable setting lives in `.env`. Nothing is hardcoded.
- `.env.example` is committed and documents every variable; `.env` is gitignored.
- `packages/shared/src/config.ts` is the only code that reads `process.env`. It validates the
  environment with Zod and exports one typed `config` object. ESLint blocks `process.env` elsewhere.
- `infra/docker/docker-compose.yml` reads its values from the same `.env`.

## Planned order of tasks

1. **Task 1**: Discovery brief
2. **Task 3**: RAG over the knowledge base
3. **Task 4**: Approval-gated agent
4. **Task 7**: Evals (promptfoo)
5. **Task P1**: RAG metrics (Ragas / DeepEval)
6. **Task P2**: Document parsing (Docling)
7. **Task 8**: Security and guardrails
8. **Task 9**: Deployment (Docker, Terraform, Helm)
9. **Task 10**: Monitoring and dashboards

Progress is tracked in [docs/task-map.md](docs/task-map.md).

## Learning journal

Every step is explained in [docs/learning/](docs/learning/README.md): what was built, why,
problems faced and how they were fixed, and interview questions.

How one chat question flows through the whole system:
[docs/learning/end-to-end-flow.md](docs/learning/end-to-end-flow.md) (visual: `docs/visual/flow/index.html`).

Visual version with diagrams for each step: open `docs/visual/index.html` in a browser.
