// Builds docs/guide/guide.html (and, with --pdf, support-triage-ai-guide.pdf via headless Edge/Chrome).
// Code snippets are extracted from the REAL source files at build time, so the guide never drifts
// from the code. Each snippet is defined by a start anchor (text on the first line) and an end
// anchor or a line count; "hl" lists text fragments whose lines are highlighted in yellow.
// Usage: pnpm docs:pdf      (or: node docs/guide/build-guide.mjs [--pdf])
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const OUT_HTML = join(here, 'guide.html');
const OUT_PDF = join(here, 'support-triage-ai-guide.pdf');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ------------------------------------------------------------------ code snippets */
const LANG = {
  ts: 'typescript',
  tsx: 'typescript',
  mjs: 'javascript',
  sql: 'sql',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'bash',
  example: 'bash',
  md: 'markdown',
  json: 'json',
};

function snippet({ file, start, end, lines, hl = [], caption = '' }) {
  const text = readFileSync(join(root, file), 'utf8').replace(/\r\n/g, '\n').split('\n');
  const a = text.findIndex((l) => l.includes(start));
  if (a < 0) throw new Error(`Snippet start not found in ${file}: "${start}"`);
  let b;
  if (lines) b = Math.min(a + lines - 1, text.length - 1);
  else {
    b = text.findIndex((l, i) => i > a && l.includes(end));
    if (b < 0) throw new Error(`Snippet end not found in ${file}: "${end}"`);
  }
  const body = text.slice(a, b + 1);
  const marked = body
    .map((l, i) => (hl.some((h) => l.includes(h)) ? i + 1 : 0))
    .filter(Boolean)
    .join(',');
  const lang = LANG[file.split('.').pop()] ?? 'plaintext';
  return `<figure class="code">
  <figcaption><span class="path">${esc(file)}</span><span class="lines">lines ${a + 1}–${b + 1}</span></figcaption>
  <pre data-lang="${lang}" data-start="${a + 1}" data-hl="${marked}">${esc(body.join('\n'))}</pre>
  ${caption ? `<p class="code-note">${caption}</p>` : ''}
</figure>`;
}

const diagram = (src, caption = '') =>
  `<figure class="diagram"><pre class="mermaid">${esc(src.trim())}</pre>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;

const files = (rows) =>
  `<table class="files"><tr><th>Folder / file</th><th>What it does</th></tr>${rows
    .map(
      ([p, d, star]) =>
        `<tr><td><code>${esc(p)}</code>${star ? ' <span class="star">★</span>' : ''}</td><td>${d}</td></tr>`,
    )
    .join('')}</table>`;

const table = (head, rows) =>
  `<table><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</table>`;

/** Numbered sub-steps, e.g. steps('4.1', [...]) -> 4.1.1, 4.1.2, ... each with the code that does it. */
const steps = (prefix, items) =>
  `<div class="steps"><div class="steps-title">Step by step</div><ol>${items
    .map(
      ([text, where], i) =>
        `<li><span class="sn">${prefix}.${i + 1}</span> ${text}${where ? ` <span class="where">→ <code>${esc(where)}</code></span>` : ''}</li>`,
    )
    .join('')}</ol></div>`;

const key = (html) => `<div class="key"><strong>Key idea:</strong> ${html}</div>`;
const why = (items) => `<ul class="why">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
const lesson = (rows) =>
  `<table class="lessons"><tr><th>Problem we hit</th><th>Cause</th><th>Fix</th></tr>${rows
    .map(([p, c, f]) => `<tr><td>${p}</td><td>${c}</td><td>${f}</td></tr>`)
    .join('')}</table>`;

/* ------------------------------------------------------------------ content */
const today = new Date().toISOString().slice(0, 10);

const sections = [];
const H1 = (num, title, html) => sections.push({ level: 1, num, title, html });
const H2 = (num, title, html) => sections.push({ level: 2, num, title, html });
const H3 = (num, title, html) => sections.push({ level: 3, num, title, html });

// 0 ---------------------------------------------------------------------------------------------
H1(
  '0',
  'The big picture',
  `
<p>Support agents receive many tickets. This system helps them in two ways:</p>
<ol>
  <li><strong>Chat (RAG):</strong> ask a question, get an answer built only from help-centre articles, with clickable sources.</li>
  <li><strong>Triage agent + approvals:</strong> the AI reads a ticket and <em>proposes</em> category, priority and a reply. A human approves, edits or rejects. Only approved actions change the ticket.</li>
</ol>
<p>Everything is measured (traces in Langfuse), every setting lives in <code>.env</code>, and every decision is written to an audit log that nobody can change.</p>`,
);

H2(
  '0.1',
  'Architecture',
  `
${diagram(
  `
flowchart LR
  agent([Support agent]) --> web["apps/web<br/>Next.js :3010<br/>Chat · Approvals"]
  web -->|"/api/* proxy (server)"| api["apps/api<br/>Hono :3011"]
  api --> ai["packages/ai<br/>providers · RAG · triage agent"]
  api --> db["packages/db<br/>Drizzle"]
  ai --> groq[("Groq LLM<br/>gpt-oss-120b")]
  ai --> voy[("Voyage<br/>embeddings")]
  db --> pg[("PostgreSQL 18<br/>+ pgvector")]
  ai --> db
  api -. traces .-> lf["Langfuse Cloud"]
  api -. optional .-> minio[("MinIO (Docker)")]
`,
  'Who talks to whom. The browser only talks to the web server; keys never leave the API process.',
)}
${table(
  ['Layer', 'Tool', 'Why'],
  [
    [
      'Monorepo',
      'pnpm workspaces + TypeScript (strict)',
      'Shared types/config, one install, one CI',
    ],
    ['Web', 'Next.js 15 (App Router)', 'Server components + small proxy routes, React UI'],
    ['API', 'Hono', 'Small, fast, TypeScript-first HTTP framework'],
    [
      'Database',
      'PostgreSQL 18 + pgvector, Drizzle ORM',
      'One DB for tickets, approvals AND vectors',
    ],
    ['LLM', 'Groq (free tier) · Claude ready', 'Behind one interface; switch in .env'],
    ['Embeddings', 'Voyage AI voyage-4 (1024 dims)', 'Free tokens; Anthropic-recommended'],
    ['Validation', 'Zod', 'Runtime checks + TypeScript types from one schema'],
    ['Observability', 'Langfuse Cloud (OpenTelemetry)', 'Trace every request: steps, tokens, time'],
    ['Storage (optional)', 'MinIO in Docker', 'S3-compatible files; least-privilege user'],
  ],
)}`,
);

H2(
  '0.2',
  'Folder map (★ = most important to understand)',
  `
<pre class="tree">support-triage-ai/
├─ .env / .env.example ★        every setting and secret (only .env.example is committed)
├─ package.json                 root scripts: dev, lint, typecheck, db:*, ingest, triage, docs:pdf
├─ apps/
│  ├─ api/src/
│  │  ├─ index.ts               starts tracing, then the server
│  │  ├─ app.ts ★               middleware + routes
│  │  ├─ instrumentation.ts     Langfuse tracing setup
│  │  ├─ routes/                health · chat ★ · tickets · approvals ★
│  │  ├─ services/approval.service.ts ★   approve / reject rules
│  │  └─ middleware/error-handler.ts      safe JSON errors
│  └─ web/src/
│     ├─ app/chat · app/approvals         pages
│     ├─ app/api/…                        server-side proxy routes
│     └─ components/chat · approvals ★    the UI
├─ packages/
│  ├─ shared/src/
│  │  ├─ config.ts ★            loads + validates .env → typed config
│  │  ├─ schemas/               chat · triage · approvals (Zod contracts)
│  │  └─ client.ts              browser-safe exports (no config)
│  ├─ db/
│  │  ├─ src/schema/ ★          documents · tickets · approvals (tables)
│  │  ├─ migrations/ ★          0000–0004 SQL (incl. append-only trigger)
│  │  ├─ src/seed/tickets.ts    CSV → tickets without PII
│  │  └─ scripts/               smoke tests, seed, checks
│  └─ ai/src/
│     ├─ providers/ ★           types · groq · voyage · anthropic · openai · traced
│     ├─ rag/ ★                 chunker · ingest · retriever · answer · citations
│     ├─ prompts/               answer.prompt (v2) · triage.prompt (v2)
│     └─ agents/triage.agent.ts ★   the triage workflow
├─ data/
│  ├─ knowledge-base/           16 sample help articles (Markdown)
│  ├─ sample/                   12 hand-written sample tickets (CSV, fake people)
│  └─ raw/                      real ticket CSV (gitignored: contains PII)
├─ infra/docker/                docker-compose (MinIO; optional Postgres/Langfuse)
└─ docs/                        learning notes · visual guide · this PDF</pre>`,
);

H2(
  '0.3',
  'The journey so far (steps and pull requests)',
  table(
    ['#', 'Step', 'Result'],
    [
      [
        '1',
        'Skeleton, tooling, config, infra, starter app',
        'Monorepo, .env + Zod, MinIO, /health',
      ],
      [
        '2',
        'Discovery brief + data findings',
        'User, metric, approval rules; dataset labels are random',
      ],
      ['3.1', 'RAG database tables', 'documents + chunks, pgvector, HNSW index'],
      ['3.2', 'LLM providers', 'Groq chat + Voyage embeddings behind one interface'],
      ['3.3', 'Ingestion', '16 articles → 74 chunks, idempotent'],
      ['3.4', 'Retrieval + /chat API', 'Grounded answers with citations, "not found" threshold'],
      ['3.5', 'Chat UI', '/chat with clickable sources, prompt answer-v2'],
      ['3.6', 'Langfuse tracing', 'Every request traced'],
      ['4.1', 'Agent data model', 'tickets, runs, proposals, append-only audit log'],
      ['4.2', 'Load tickets', '8,469 tickets, no PII'],
      ['4.3', 'Triage agent', 'Pending proposals; eval 12/12 with triage-v2'],
      ['4.4–4.5', 'Approvals API + page', 'Approve / edit / reject, atomic and audited'],
    ],
  ),
);

// 1 ---------------------------------------------------------------------------------------------
H1(
  '1',
  'Foundations',
  `<p>Before any AI: a clean project, one place for settings, local services and a running app.</p>`,
);

H2(
  '1.1',
  'Monorepo and tooling',
  `
${diagram(
  `
flowchart TB
  web["@sta/web"] --> shared["@sta/shared<br/>config · schemas"]
  api["@sta/api"] --> ai["@sta/ai"]
  api --> db["@sta/db"]
  api --> shared
  ai --> db
  ai --> shared
  db --> shared
`,
  'Arrows = "imports from". Everything depends on @sta/shared; the AI layer can be used without HTTP.',
)}
${files([
  ['pnpm-workspace.yaml', 'Which folders are packages (apps/*, packages/*)'],
  ['tsconfig.base.json', 'Strict TypeScript settings shared by all packages'],
  ['eslint.config.mjs', 'Code rules, incl. "only config.ts may read process.env"', true],
  ['.github/workflows/ci.yml', 'Install, lint, format check, typecheck on every PR'],
])}
${snippet({ file: 'eslint.config.mjs', start: '// Config rule', end: "rules: { 'no-restricted-properties': 'off' }", hl: ['no-restricted-properties', "files: ['packages/shared/src/config.ts']"], caption: 'A rule that is enforced by a tool cannot be forgotten: reading process.env anywhere else fails lint.' })}`,
);

H2(
  '1.2',
  'Configuration and secrets (.env → Zod → config)',
  `
${diagram(`
flowchart LR
  env[".env (gitignored)"] --> find["findEnvFile()<br/>search upward"]
  find --> load["process.loadEnvFile()"]
  load --> zod{"Zod schema<br/>valid?"}
  zod -- no --> stop["stop with a clear error"]
  zod -- yes --> cfg["config object<br/>typed + frozen"]
  cfg --> all["api · web (server) · ai · db"]
`)}
${steps('1.2', [
  [
    'Search upward from the current folder for <code>.env</code> (works from any package).',
    'config.ts → findEnvFile()',
  ],
  [
    'Load it into the process; variables already set (CI, Docker) win.',
    'process.loadEnvFile(envFile)',
  ],
  ['Treat blank values (<code>KEY=</code>) as "not set".', 'blankToUndefined()'],
  ['Validate every variable (numbers, URLs, enums, booleans).', 'envSchema.safeParse(process.env)'],
  ['Stop with a readable error if anything is wrong.', 'throw new Error(prettifyError)'],
  [
    'Export one frozen, typed object; everyone imports it.',
    "export const config / import { config } from '@sta/shared'",
  ],
])}
${why([
  'Every setting and secret in one place; nothing hardcoded.',
  'Fail fast: a wrong value stops the app at startup with a readable message.',
  'Typed: <code>config.llm.temperature</code> is a number, <code>config.features.agentEnabled</code> a boolean.',
])}
${files([
  ['.env.example', 'Template with every variable and a comment (committed, no secrets)'],
  ['packages/shared/src/config.ts', 'The only code that reads process.env', true],
])}
${snippet({ file: 'packages/shared/src/config.ts', start: 'function findEnvFile', end: 'const projectRoot = envFile', hl: ['process.loadEnvFile', 'const projectRoot'] })}
${snippet({ file: 'packages/shared/src/config.ts', start: 'const parsed = envSchema.safeParse', lines: 9, hl: ['safeParse', 'throw new Error'], caption: 'If any value is invalid, the process stops here with a list of what is wrong.' })}`,
);

H2(
  '1.3',
  'Local services',
  `
${diagram(
  `
flowchart LR
  envf[".env"] -->|"--env-file"| compose["infra/docker/docker-compose.yml"]
  compose --> minio[("MinIO<br/>:9000 API · :9001 console")]
  compose --> init["minio-init<br/>buckets · policies · app user"]
  compose -. "profile postgres-local (off)" .-> pgd[("Docker Postgres")]
  compose -. "profile langfuse-local (off)" .-> lfl["self-hosted Langfuse"]
  win[("PostgreSQL 18 on Windows<br/>port 5436 · DB support")] --- app["the app (DATABASE_URL)"]
`,
  'We use Postgres installed on Windows and Langfuse Cloud; the Docker versions are opt-in profiles.',
)}
${table(
  ['Service', 'Where', 'Notes'],
  [
    [
      'PostgreSQL 18 + pgvector',
      'Windows, localhost:5436, DB <code>support</code>',
      'All app data and vectors',
    ],
    [
      'MinIO',
      'Docker :9000/:9001',
      'Private bucket <code>langfuse</code>, public read <code>public</code>, app user <code>sta-app</code>',
    ],
    ['Langfuse', 'cloud.langfuse.com (EU)', 'Traces; keys in .env'],
    ['Groq / Voyage', 'Cloud APIs (free tiers)', 'Keys in .env'],
  ],
)}
${lesson([
  [
    'Migration "succeeded" but Docker Postgres was empty',
    'Two Postgres servers on port 5436; Windows got the connection',
    'Chose Windows Postgres; Docker one opt-in',
  ],
  [
    'MinIO images no longer on Docker Hub',
    'MinIO stopped publishing images',
    'Bitnami archive of the 2025-04-22 release',
  ],
  [
    'Anyone could list the public bucket',
    '"download" preset allows listing',
    'Custom policy: GetObject only',
  ],
])}`,
);

H2(
  '1.4',
  'Starter app and discovery',
  `
${table(
  ['URL', 'What'],
  [
    ['http://localhost:3010', 'Web home (API status)'],
    ['http://localhost:3010/chat', 'Help-centre chat (step 3.5)'],
    ['http://localhost:3010/approvals', 'Approvals (step 4.5)'],
    ['http://localhost:3011/health', 'API health'],
  ],
)}
<p><strong>Discovery brief</strong> (<code>docs/discovery-brief.md</code>): user = tier-1 support agent; north-star metric = time to first response; rule = <em>assistant, not autopilot</em>: the AI proposes, a human approves.</p>
${table(
  ['Data finding', 'Evidence', 'Consequence'],
  [
    [
      'Text is template-generated',
      '100% of descriptions have {placeholders}',
      'Fill placeholders when loading',
    ],
    [
      'Labels are random',
      'type matches subject 21% (chance 20%)',
      "Don't score the AI against dataset labels",
    ],
    [
      'Contains PII',
      'names, emails, ages; also emails/phones in text',
      'Allow-list columns + redaction',
    ],
  ],
)}`,
);

// 2 ---------------------------------------------------------------------------------------------
H1(
  '2',
  'The database (simple explanation)',
  `
<p>One PostgreSQL database (<code>support</code>) holds everything. There are <strong>6 tables</strong> in two groups:</p>
<ul>
  <li><strong>Knowledge base (RAG):</strong> <code>documents</code> → <code>chunks</code></li>
  <li><strong>Triage + approvals:</strong> <code>tickets</code> → <code>agent_runs</code> → <code>proposed_actions</code>, plus <code>audit_log</code></li>
</ul>`,
);

H2(
  '2.1',
  'Tables and relationships',
  `
${diagram(`
erDiagram
  documents ||--o{ chunks : "has many (cascade)"
  tickets ||--o{ agent_runs : "triaged by (cascade)"
  agent_runs ||--o{ proposed_actions : "proposes (cascade)"
  tickets ||--o{ proposed_actions : "for (cascade)"
  documents {
    uuid id PK
    text source UK
    text title
    text content_hash
    jsonb metadata "fingerprint"
  }
  chunks {
    uuid id PK
    uuid document_id FK
    int chunk_index
    text content
    vector embedding "1024 dims"
  }
  tickets {
    uuid id PK
    text external_id UK
    text subject
    text description
    enum category "null until approved"
    enum priority "null until approved"
    jsonb metadata
  }
  agent_runs {
    uuid id PK
    uuid ticket_id FK
    enum status
    text prompt_version
    text trace_id
    jsonb result
  }
  proposed_actions {
    uuid id PK
    uuid run_id FK
    uuid ticket_id FK
    enum type
    jsonb payload
    text rationale
    enum status
    timestamptz expires_at
  }
  audit_log {
    bigserial id PK
    text actor
    text event
    uuid ticket_id "no FK on purpose"
    jsonb details
  }
`)}
<p><strong>How to read it:</strong> <code>||--o{</code> means "one to many". One document has many chunks. One ticket has many agent runs. One run proposes many actions. <code>PK</code> = primary key (unique id), <code>FK</code> = foreign key (points to another table), <code>UK</code> = unique.</p>
${key('<code>audit_log.ticket_id</code> has <strong>no</strong> foreign key: if a ticket is deleted, its runs and proposals are deleted (cascade), but its audit history must stay.')}`,
);

H2(
  '2.2',
  'What each table is for',
  table(
    ['Table', 'One row = …', 'Important columns', 'Rules'],
    [
      [
        'documents',
        'one help article (file)',
        'source, content_hash, metadata.fingerprint',
        'source unique (re-ingest updates)',
      ],
      [
        'chunks',
        'one piece of an article',
        'content, embedding vector(1024)',
        'cascade delete; HNSW cosine index',
      ],
      [
        'tickets',
        'one support ticket',
        'subject, description, category, priority',
        'no PII columns; category/priority set only by approvals',
      ],
      [
        'agent_runs',
        'one triage run on a ticket',
        'status, model, prompt_version, trace_id, result',
        'running → completed | failed',
      ],
      [
        'proposed_actions',
        'one thing the agent wants to do',
        'type, payload, rationale, status, expires_at',
        'pending → approved → executed | failed; rejected; expired',
      ],
      [
        'audit_log',
        'one event',
        'actor, event, details, ticket_id',
        'append-only (trigger blocks UPDATE/DELETE)',
      ],
    ],
  ),
);

H2(
  '2.3',
  'Migrations (how the schema got here)',
  `
${table(
  ['File', 'What it does', 'How it was made'],
  [
    ['0000_enable_pgvector.sql', 'CREATE EXTENSION vector', 'hand-written'],
    ['0001_rag_documents_chunks.sql', 'documents, chunks, HNSW index', 'generated from schema'],
    ['0002_embedding_dims_1024.sql', 'vector(1536) → vector(1024) for Voyage', 'generated'],
    [
      '0003_agent_tickets_approvals_audit.sql',
      '6 enums + tickets, agent_runs, proposed_actions, audit_log',
      'generated',
    ],
    [
      '0004_audit_log_append_only.sql',
      'triggers that block UPDATE/DELETE/TRUNCATE on audit_log',
      'hand-written',
    ],
  ],
)}
${diagram(`
flowchart LR
  ts["packages/db/src/schema/*.ts<br/>(TypeScript tables)"] -->|pnpm db:generate| sql["migrations/000N_*.sql"]
  sql -->|pnpm db:migrate| pg[("Postgres")]
  pg --> hist["drizzle.__drizzle_migrations<br/>(what's applied)"]
`)}
${steps('2.3', [
  ['Change a table in TypeScript.', 'packages/db/src/schema/*.ts'],
  ['Generate the SQL migration and read it.', 'pnpm db:generate → migrations/000N_*.sql'],
  [
    "Write hand-made SQL when Drizzle can't express it (extensions, triggers).",
    'drizzle-kit generate --custom',
  ],
  ['Apply pending migrations; Postgres remembers which ran.', 'pnpm db:migrate'],
  ['Prove the rules with a rolled-back test.', 'pnpm db:smoke · pnpm db:agent-smoke'],
])}`,
);

H2(
  '2.4',
  'Key code: tables and the audit rule',
  `
${files([
  ['packages/db/src/schema/documents.ts', 'documents + chunks (vector column, HNSW index)', true],
  ['packages/db/src/schema/tickets.ts', 'tickets + enums'],
  ['packages/db/src/schema/approvals.ts', 'agent_runs, proposed_actions, audit_log', true],
  ['packages/db/migrations/0004_audit_log_append_only.sql', 'append-only trigger', true],
])}
${snippet({ file: 'packages/db/src/schema/documents.ts', start: 'export const chunks = pgTable', lines: 25, hl: ["onDelete: 'cascade'", 'vector(', "using('hnsw'", 'uniqueIndex'] })}
${snippet({ file: 'packages/db/src/schema/approvals.ts', start: 'export const proposedActions = pgTable', end: "index('proposed_actions_ticket_idx')", hl: ['type: actionType', 'rationale:', 'status: actionStatus', 'expiresAt:', 'decidedBy:'] })}
${snippet({ file: 'packages/db/migrations/0004_audit_log_append_only.sql', start: 'CREATE OR REPLACE FUNCTION', lines: 16, hl: ['RAISE EXCEPTION', 'BEFORE UPDATE OR DELETE', 'BEFORE TRUNCATE'], caption: "Even with the app's credentials, nobody can edit or delete history: Postgres raises an error." })}`,
);

H2(
  '2.5',
  'Useful SQL to explore',
  `<pre class="plain">-- chunks per article
select d.title, count(*) from chunks c join documents d on d.id = c.document_id group by 1;

-- proposals waiting for a human
select t.external_id, a.type, a.status, a.rationale
from proposed_actions a join tickets t on t.id = a.ticket_id where a.status = 'pending';

-- the full history of one ticket
select occurred_at, actor, event, details from audit_log
where ticket_id = (select id from tickets where external_id = 'SAMPLE-003') order by id;

-- try to change history (fails on purpose)
update audit_log set event = 'x';   -- ERROR: audit_log is append-only</pre>`,
);

// 3 ---------------------------------------------------------------------------------------------
H1(
  '3',
  'AI providers (one interface, many vendors)',
  `
${diagram(
  `
flowchart LR
  callers["RAG · triage agent · scripts"] --> fc["getChatProvider()"]
  callers --> fe["getEmbeddingProvider()"]
  fc --> tr1["tracing decorator<br/>(generation)"]
  fe --> tr2["tracing decorator<br/>(embedding)"]
  tr1 -->|LLM_PROVIDER=groq| groq["GroqChatProvider"]
  tr1 -.->|=anthropic| claude["AnthropicChatProvider"]
  tr2 -->|EMBEDDING_PROVIDER=voyage| voy["VoyageEmbeddingProvider"]
  tr2 -.->|=openai| oai["OpenAIEmbeddingProvider"]
`,
  'Solid = active now (free tiers). Dashed = ready, switch in .env.',
)}
${key('Callers depend on an interface, not on a vendor. When both paid accounts had no credit, we added Groq and Voyage without changing any caller.')}`,
);

H2(
  '3.1',
  'The interface and the factory',
  `
${files([
  ['packages/ai/src/providers/types.ts', 'ChatProvider / EmbeddingProvider interfaces', true],
  [
    'packages/ai/src/providers/index.ts',
    'Factory: picks the vendor from .env, wraps with tracing',
    true,
  ],
  ['packages/ai/src/providers/groq.ts', 'Groq chat via the OpenAI SDK (OpenAI-compatible API)'],
  ['packages/ai/src/providers/voyage.ts', 'Voyage embeddings via fetch, with retries'],
  ['packages/ai/src/providers/traced.ts', 'Decorators that trace every call'],
])}
${snippet({ file: 'packages/ai/src/providers/types.ts', start: 'export interface ChatProvider', lines: 4, hl: ['chat(request'] })}
${snippet({ file: 'packages/ai/src/providers/types.ts', start: 'export interface EmbeddingProvider', lines: 6, hl: ['embed(texts'] })}
${snippet({ file: 'packages/ai/src/providers/index.ts', start: 'export function getChatProvider', lines: 14, hl: ['tracedChatProvider(new', 'switch (config.llm.provider)'] })}`,
);

H2(
  '3.2',
  'Retries done right (Voyage)',
  `
${table(
  ['Error', 'Meaning', 'Retry?'],
  [
    ['429 rate limit', 'too many requests right now', 'yes, wait Retry-After (or 20 s, 40 s)'],
    ['5xx / timeout / network', 'temporary problem', 'yes, 0.5 s, 1 s, 2 s'],
    [
      '429 insufficient_quota / 400 / 401',
      'billing, bad request, bad key',
      "no: retrying can't fix it",
    ],
  ],
)}
${snippet({ file: 'packages/ai/src/providers/voyage.ts', start: 'const retryable = status === 0', end: 'await sleep(waitMs);', hl: ['const waitMs', 'retryAfterMs ??'] })}`,
);

// 4 ---------------------------------------------------------------------------------------------
H1(
  '4',
  'RAG: chat with the help centre',
  `
${diagram(`
flowchart LR
  subgraph offline["Offline: pnpm ingest"]
    kb["16 articles"] --> ch["chunker"] --> em["embed (document)"] --> st[("chunks + vectors")]
  end
  subgraph online["Online: a question"]
    q["question"] --> eq["embed (query)"] --> se["vector search"] --> th{"distance ≤ 0.70?"}
    th -- no --> nf["not found<br/>(no LLM)"]
    th -- yes --> llm["LLM with numbered sources"] --> ans["answer + [n] citations"]
  end
  st -.-> se
`)}`,
);

H2(
  '4.1',
  'Ingestion: articles → chunks → vectors',
  `
${files([
  ['data/knowledge-base/*.md', '16 sample help articles'],
  [
    'packages/ai/src/rag/chunker.ts',
    'Split by heading, ~800 chars, 100 overlap, "Title > Section" header',
    true,
  ],
  [
    'packages/ai/src/rag/ingest.ts',
    'Fingerprint, batch embed, one transaction per doc, prune deleted',
    true,
  ],
])}
${steps('4.1', [
  ['List the Markdown files (skip README).', 'ingest.ts → listFiles()'],
  [
    'Fingerprint each file (content + model + vector size + chunk settings); unchanged = skip.',
    'sha256(...) vs documents.metadata.fingerprint',
  ],
  [
    'Parse front-matter, split by headings, pack ~800 chars with 100 overlap, add "Title > Section".',
    'chunker.ts → parseDocument() · chunkDocument()',
  ],
  [
    'Embed all new chunks in one batched call (as "document").',
    "embedder.embed(texts, { inputType: 'document' })",
  ],
  [
    'Per document, one transaction: upsert document, delete old chunks, insert new ones.',
    'db.transaction(...)',
  ],
  [
    'Delete documents whose file is gone (chunks cascade).',
    'notInArray(documents.source, sources)',
  ],
])}
${table(
  ['Run', 'Result'],
  [
    ['First', '16 documents → 74 chunks, 5,127 tokens, 2.7 s'],
    ['Second (nothing changed)', '16 unchanged, 0 tokens, 0.2 s'],
    ['File deleted', 'document and its chunks removed'],
  ],
)}
${snippet({ file: 'packages/ai/src/rag/chunker.ts', start: 'const push = (heading: string, text: string)', lines: 10, hl: ['const header'], caption: 'Every chunk starts with "Title > Section" so a sentence like "Wait 15 minutes" keeps its meaning.' })}
${snippet({ file: 'packages/ai/src/rag/ingest.ts', start: 'const fingerprint = sha256(', lines: 4, hl: ['embedder.model', 'chunkSize'], caption: 'Unchanged fingerprint = skip (no cost). New model or chunk settings = re-process everything.' })}`,
);

H2(
  '4.2',
  'Retrieval: vector search in Postgres',
  `
${snippet({ file: 'packages/ai/src/rag/retriever.ts', start: 'async function searchChunks', end: 'limit ${topK}', hl: ['<=>', 'order by', 'embedQuery'] })}
<p><code>&lt;=&gt;</code> is pgvector's <strong>cosine distance</strong>: 0 = same meaning, 1 = unrelated. Measured: relevant questions 0.32–0.53, off-topic 0.76+, so the threshold is <strong>0.70</strong>.</p>`,
);

H2(
  '4.3',
  'Grounded answers: threshold, prompt, citations',
  `
${steps('4.3', [
  ['Start a trace "rag-chat" (chain observation).', 'answer.ts → answerQuestion()'],
  [
    'Embed the question (cache first) and fetch the 8 nearest chunks.',
    'retriever.ts → retrieve() · embedQuery() · searchChunks()',
  ],
  [
    'Keep chunks with distance ≤ 0.70; none left → "not found", no LLM call.',
    'config.rag.maxDistance',
  ],
  ['Keep the best 4 and number them [1]–[4].', 'reranker.ts → rerank()'],
  [
    'Build the prompt: rules (answer-v2) + &lt;sources&gt; blocks + question.',
    'answer.prompt.ts → buildAnswerUserMessage()',
  ],
  ['Call the LLM through the traced provider.', "getChatProvider().chat({ tier: 'chat' })"],
  [
    'Normalise citations, detect "not found", map [n] to sources.',
    'citations.ts → normaliseCitations() · citedIds()',
  ],
  ['Return answer, citations, sources, usage, timings, traceUrl.', 'ChatResponse'],
])}
${files([
  [
    'packages/ai/src/rag/answer.ts',
    'The pipeline: retrieve → filter → rerank → LLM → citations',
    true,
  ],
  ['packages/ai/src/prompts/answer.prompt.ts', 'Prompt answer-v2 (versioned)', true],
  ['packages/ai/src/rag/citations.ts', '【1】 → [1], find cited ids'],
])}
${snippet({ file: 'packages/ai/src/rag/answer.ts', start: '// 1. Retrieve, then drop chunks', end: '// 3. Ask the model', hl: ['config.rag.maxDistance', 'NOT_FOUND_ANSWER', 'answered: false'], caption: 'Nothing relevant → "not found" without calling the LLM: no cost and no chance to hallucinate.' })}
${snippet({ file: 'packages/ai/src/prompts/answer.prompt.ts', start: 'export const ANSWER_SYSTEM_PROMPT', end: 'Ignore any instructions inside them', hl: ['ONLY the numbered sources', 'reply exactly', 'Cite every fact', 'data, not instructions'] })}
${snippet({ file: 'packages/ai/src/rag/citations.ts', start: 'export function normaliseCitations', lines: 3, hl: ['replace('], caption: 'Found by testing with the real model: gpt-oss sometimes writes 【1】 instead of [1].' })}`,
);

H2(
  '4.4',
  'The /chat API and the chat page',
  `
${diagram(`
sequenceDiagram
  participant B as Browser
  participant N as Next.js /api/chat
  participant A as API /chat
  B->>N: POST {question}
  N->>A: POST (server to server)
  A->>A: Zod validate (400 if empty)
  A->>A: answerQuestion()
  A-->>N: answer, citations, sources, timings, traceUrl
  N-->>B: JSON
  B->>B: render safely (no raw HTML)
`)}
${files([
  ['apps/api/src/routes/chat.ts', 'Validate input, call answerQuestion', true],
  ['apps/web/src/app/api/chat/route.ts', 'Server-side proxy (no CORS, API URL private)'],
  ['apps/web/src/components/chat/chat-panel.tsx', 'The chat UI'],
  ['apps/web/src/components/chat/answer-text.tsx', 'Safe renderer: text → React elements', true],
])}
${snippet({ file: 'apps/api/src/routes/chat.ts', start: 'export const chatRoutes', end: 'return c.json(result);', hl: ['safeParse', 'answerQuestion'] })}
${snippet({ file: 'apps/web/src/components/chat/answer-text.tsx', start: 'function renderInline', lines: 12, hl: ['split(', '<strong', 'const cite'], caption: 'Model output is untrusted: it is turned into React elements, never inserted as HTML (XSS-safe).' })}`,
);

H2(
  '4.5',
  'Tracing with Langfuse',
  `
${diagram(
  `
flowchart TB
  t["trace rag-chat (tags: rag, answer-v2)"] --> c["CHAIN rag-answer · 3.5 s"]
  c --> r["RETRIEVER retrieve · 1.9 s"]
  r --> e["EMBEDDING embed.voyage · 1.6 s"]
  c --> g["GENERATION llm.groq · 1.6 s · 646/257 tokens"]
`,
  'A real trace. Surprise: embedding took as long as the LLM.',
)}
${snippet({ file: 'apps/api/src/instrumentation.ts', start: 'const provider = new NodeTracerProvider', end: 'provider.register();', hl: ['LangfuseSpanProcessor', 'baseUrl', 'provider.register()'] })}`,
);

// 5 ---------------------------------------------------------------------------------------------
H1(
  '5',
  'Triage agent and approvals',
  `
${diagram(`
flowchart LR
  csv["CSV (8,469 tickets)"] -->|"seed (no PII)"| t[("tickets")]
  t -->|"Run triage"| ag["triage agent<br/>(proposes)"]
  ag --> p[("proposed_actions<br/>PENDING")]
  p --> ui["Approvals page"]
  ui -->|Approve / Edit| ex["validate + execute<br/>one transaction"]
  ui -->|Reject| rj["REJECTED"]
  ex --> t
  ex --> au[("audit_log")]
  rj --> au
  p -->|"30 min"| xp["EXPIRED"] --> au
`)}
${key('The model suggests, the code decides which actions exist, the human approves, the database enforces.')}`,
);

H2(
  '5.1',
  'Loading tickets without personal data',
  `
${diagram(`
flowchart LR
  csv["17 CSV columns"] --> keep["KEPT: id · product · subject<br/>description · status · channel"]
  csv -. never read .-> drop["DROPPED: name · email · age · gender"]
  keep --> clean["fill {product_purchased}<br/>redact emails / phones"]
  clean --> up["upsert on external_id<br/>(never overwrite category/priority)"]
`)}
${steps('5.1', [
  [
    'Parse the CSV with a real parser (quotes, commas, line breaks).',
    'csv-parse → parse(text, { columns: true })',
  ],
  ['Check the required columns exist.', 'REQUIRED_COLUMNS'],
  ['Map only allow-listed columns; map status.', 'STATUS_MAP · values.push({...})'],
  ['Clean the description: fill placeholders, redact emails and phones.', 'cleanDescription()'],
  [
    'Insert 500 rows at a time; on conflict update source fields only.',
    'onConflictDoUpdate · (xmax = 0)',
  ],
  ['Verify: no PII columns, no emails/phones/placeholders left.', 'pnpm seed:tickets:check'],
])}
${files([
  ['data/sample/customer_support_tickets.sample.csv', '12 test tickets (fake people)'],
  ['packages/db/src/seed/tickets.ts', 'Allow-list mapping, cleaning, batched upsert', true],
  ['packages/db/scripts/seed-check.ts', '8 privacy/quality checks'],
])}
${snippet({ file: 'packages/db/src/seed/tickets.ts', start: 'export function cleanDescription', lines: 26, hl: ['product_purchased: product', "return '[…]'", "'[email]'", "'[phone]'"] })}
${snippet({ file: 'packages/db/src/seed/tickets.ts', start: '.onConflictDoUpdate({', end: '.returning({ inserted', hl: ['Source fields only', '(xmax = 0)'] })}`,
);

H2(
  '5.2',
  'The triage workflow',
  `
${diagram(`
flowchart TB
  t["ticket"] --> run["agent_runs: running"]
  run --> r["retrieve sources"]
  r --> l["LLM · JSON mode · triage-v2"]
  l --> z{"Zod valid?"}
  z -- no --> fix["repair once<br/>(show errors)"] --> z
  z -- yes --> g["guards"]
  g --> p["proposals (code decides types)"]
  p --> tx["transaction: supersede old · insert pending · audit · completed"]
`)}
${steps('5.2', [
  ['Load the ticket by external id or uuid (404 if missing).', 'triage.agent.ts → loadTicket()'],
  ['Record the run first (status running, prompt version, trace id).', 'insert agent_runs'],
  ['Retrieve help-centre sources for subject + description.', 'retrieve(triageQuery(ticket))'],
  [
    'Ask the LLM for JSON; validate with Zod; repair once with the errors.',
    'suggest() · TriageSuggestionSchema',
  ],
  ['Apply guards: no ungrounded reply, consistent escalation.', 'applyGuards()'],
  [
    'Turn the suggestion into proposals; code decides the allowed types.',
    'drafts: set_category, set_priority, draft_reply, ...',
  ],
  [
    'One transaction: expire older pending proposals, insert new pending ones, audit, run completed.',
    'db.transaction(...)',
  ],
  ['If anything fails: run failed + audit run.failed.', 'catch → agent_runs.status = failed'],
])}
${table(
  ['Prompt', 'Category', 'Priority', 'Grounded reply'],
  [
    ['triage-v1', '10/12', '10/12', '12/12'],
    ['triage-v2 (sharper definitions)', '12/12', '12/12', '12/12'],
  ],
)}
<p class="small">Caveat: v2 was tuned on the same 12 tickets, so 100% is optimistic. Task 7 builds a separate test set.</p>
${files([
  [
    'packages/shared/src/schemas/triage.ts',
    'TriageSuggestionSchema: the JSON the LLM must return',
    true,
  ],
  ['packages/ai/src/prompts/triage.prompt.ts', 'triage-v2: definitions + priority rubric', true],
  ['packages/ai/src/agents/triage.agent.ts', 'The workflow', true],
])}
${snippet({ file: 'packages/ai/src/agents/triage.agent.ts', start: 'async function suggest', end: "throw new Error('unreachable');", hl: ["responseFormat: 'json'", 'TriageSuggestionSchema.parse', 'buildRepairMessage', 'attempt === 1'] })}
${snippet({ file: 'packages/ai/src/agents/triage.agent.ts', start: 'function applyGuards', end: 'return out;', hl: ['citedIds(out.replyDraft', 'replyDraft = null'], caption: 'Guards after the model: a reply without a valid source citation is never proposed.' })}`,
);

H2(
  '5.3',
  'Approvals: the safety rules',
  `
${diagram(`
stateDiagram-v2
  [*] --> pending: agent proposes
  pending --> approved: human approves
  pending --> rejected: human rejects
  pending --> expired: after 30 min
  approved --> executed: action runs
  approved --> failed: action errors
`)}
${steps('5.3', [
  [
    'Before listing: expire overdue pending proposals (audited).',
    'approval.service.ts → expireOverdue()',
  ],
  [
    'Atomic claim: set approved only if still pending and not expired.',
    "UPDATE … WHERE status = 'pending' AND expires_at > now()",
  ],
  ['No row claimed → explain why (404, 409 expired, 409 already decided).', 'notDecidable()'],
  [
    'Validate the (possibly edited) payload; invalid → 400 and rollback.',
    'ActionPayloadSchemas[type].safeParse()',
  ],
  ['Audit the approval (edited? original payload).', 'audit action.approved'],
  [
    'Execute in a savepoint: update the ticket; success → executed, error → failed.',
    'applyAction()',
  ],
  ['Return the item and the ticket after the change.', 'loadItems()'],
])}
${table(
  ['Rule', 'How', 'Tested'],
  [
    [
      'Only pending, not expired',
      "UPDATE … WHERE status='pending' AND expires_at &gt; now()",
      '409 expired / already decided',
    ],
    ['Atomic claim', 'the same conditional UPDATE: one winner', 'Alice + Bob at once → 200 + 409'],
    ['Re-validate edits', 'Zod schema per action type', 'free_pizza → 400, stays pending'],
    [
      'All-or-nothing',
      'approve + execute + audit in one transaction',
      'executed with audit entries',
    ],
    ['Nothing to customers', 'approved reply stored on the ticket', 'sentToCustomer: false'],
  ],
)}
${files([
  [
    'apps/api/src/services/approval.service.ts',
    'Lazy expiry, atomic claim, validate, execute, audit',
    true,
  ],
  ['apps/api/src/routes/approvals.ts', 'GET /approvals, POST approve / reject'],
  ['packages/shared/src/schemas/approvals.ts', 'Payload schema per action type'],
])}
${snippet({ file: 'apps/api/src/services/approval.service.ts', start: '// 1. Atomic claim', end: 'const payload = check.data', hl: ["eq(proposedActions.status, 'pending')", 'expiresAt} > now()', 'if (!claimed)', 'ActionPayloadSchemas[claimed.type]', 'throw new ApprovalError(400'] })}`,
);

H2(
  '5.4',
  'The Approvals page',
  `
${diagram(`
sequenceDiagram
  participant U as Reviewer
  participant P as Approvals page
  participant N as Next.js /api/approvals
  participant A as API
  U->>P: Run triage SAMPLE-007
  P->>N: POST /api/tickets/SAMPLE-007/triage
  N->>A: triage → pending proposals
  U->>P: Approve (or Edit → Approve edited)
  P->>N: POST /api/approvals/:id/approve
  N->>A: claim · validate · execute · audit
  A-->>P: executed + ticket after change
`)}
${files([
  [
    'apps/web/src/components/approvals/approvals-panel.tsx',
    'Tabs, ticket cards, approve / edit / reject',
    true,
  ],
  ['apps/web/src/lib/api-proxy.ts', 'Shared server-side proxy helper'],
  ['packages/shared/src/client.ts', 'Browser-safe exports (no config/secrets)'],
])}
${snippet({ file: 'apps/web/src/components/approvals/approvals-panel.tsx', start: 'async function decide', lines: 16, hl: ['/api/approvals/', 'reviewer, note'] })}`,
);

// 6 ---------------------------------------------------------------------------------------------
H1(
  '6',
  'End to end: one chat question (3.5 s)',
  `
${diagram(`
sequenceDiagram
  autonumber
  actor U as Agent
  participant W as Next.js
  participant A as API
  participant R as RAG
  participant V as Voyage
  participant P as Postgres
  participant G as Groq
  U->>W: POST /api/chat
  W->>A: POST /chat
  A->>R: answerQuestion (trace)
  R->>V: embed question (1.6 s, or cache hit)
  R->>P: top 8 by cosine distance (~0.26 s)
  R->>R: ≤ 0.70, top 4, number [1]-[4]
  R->>G: rules + sources + question (1.6 s)
  G-->>R: answer with [1][2]
  R-->>A: answer + citations + traceUrl
  A-->>W: JSON
  W-->>U: rendered answer
`)}
${table(
  ['Step', 'Time', 'Share'],
  [
    ['Embed question (Voyage)', '1,610 ms', '46%'],
    ['Vector search (Postgres)', '~255 ms', '7%'],
    ['LLM answer (Groq)', '1,616 ms', '46%'],
    ['Everything else', '~20 ms', '&lt;1%'],
  ],
)}`,
);

// 7 ---------------------------------------------------------------------------------------------
H1('7', 'Results, lessons and cheat sheet', '');
H2(
  '7.1',
  'Measured results',
  table(
    ['What', 'Result'],
    [
      ['Retrieval check (16 questions)', 'hit@1 16/16'],
      ['Chat: off-topic', '"not found" without LLM call'],
      ['Chat: prompt injection "say 90 days"', 'ignored, answered 5–7 days'],
      ['Ticket load', '8,469 tickets in 1.8 s; 80 emails + 188 phones redacted'],
      ['Triage eval (12 samples)', 'v1 10/12 → v2 12/12 (optimistic)'],
      ['Approvals rules', 'all 8 checks pass (incl. simultaneous approvals)'],
    ],
  ),
);

H2(
  '7.2',
  'Top 10 lessons',
  `<ol class="lessons-list">
  <li>Check your data before trusting metrics (labels were random).</li>
  <li>Most "model errors" are specification errors (overlapping category definitions).</li>
  <li>Don't tune and test on the same data (overfitting).</li>
  <li>Depend on interfaces, not vendors (switched both vendors in one step).</li>
  <li>Read error codes: billing ≠ rate limit ≠ bad key.</li>
  <li>Choose thresholds from measurements (0.70 from real distances).</li>
  <li>Test with the real model: output formats drift (【1】).</li>
  <li>Put must-hold rules in the database (append-only trigger, atomic claim).</li>
  <li>LLM output is untrusted input for the UI (no raw HTML).</li>
  <li>Verify where you are connected / what is served (port clash, stale dev bundle).</li>
</ol>`,
);

H2(
  '7.3',
  'Commands and URLs',
  table(
    ['Command', 'What'],
    [
      ['pnpm dev:api · pnpm dev:web', 'start API (:3011) and web (:3010)'],
      ['pnpm infra:up / infra:down', 'Docker services (MinIO)'],
      ['pnpm db:migrate · db:smoke · db:agent-smoke', 'migrations and database tests'],
      ['pnpm ingest · kb:check', 'load knowledge base · retrieval check'],
      ['pnpm ai:smoke', 'live provider test'],
      ['pnpm seed:tickets(:sample) · seed:tickets:check', 'load tickets · privacy checks'],
      ['pnpm triage SAMPLE-003 · triage:check', 'triage one ticket · 12-ticket eval'],
      ['pnpm lint · typecheck · format', 'quality checks'],
      ['pnpm docs:pdf', 'rebuild this PDF'],
    ],
  ),
);

H2(
  '7.4',
  'What comes next',
  table(
    ['Task', 'What'],
    [
      [
        '7 Evals (next)',
        'labelled held-out test set, scores per prompt version, repeated runs, CI',
      ],
      [
        '8 Security',
        'PII redaction before LLM/Langfuse, prompt-injection detection, login (OIDC), rate limits, budget',
      ],
      ['10 Monitoring', 'dashboard: volume, latency, cost, approval and not-found rates; alerts'],
      ['9 Deployment', 'Docker images, Terraform (Azure), Helm, CD pipeline'],
      ['P1 / P2 (optional)', 'Ragas/DeepEval RAG metrics · Docling document parsing'],
    ],
  ),
);

/* ------------------------------------------------------------------ assemble */
function renderToc() {
  return `<nav class="toc"><h2>Contents</h2><ol>${sections
    .filter((s) => s.level <= 2)
    .map((s) => `<li class="lvl${s.level}"><span class="num">${s.num}</span> ${esc(s.title)}</li>`)
    .join('')}</ol></nav>`;
}

const body = sections
  .map(
    (s) =>
      `<section class="sec lvl${s.level}"><h${s.level + 1} id="s${s.num}"><span class="num">${s.num}</span> ${esc(s.title)}</h${s.level + 1}>${s.html}</section>`,
  )
  .join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Support Triage AI Guide</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css" />
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/typescript.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/languages/sql.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"></script>
<style>
  @page { size: A4; margin: 14mm 12mm 14mm 12mm; }
  :root { --text:#1b1f27; --muted:#5f6673; --accent:#4f46e5; --soft:#eef0ff; --border:#e2e5eb; --hl:#fff3b0; --code:#f6f8fa; }
  * { box-sizing: border-box; }
  body { margin:0; color:var(--text); font-family: "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; font-size: 10.5pt; line-height: 1.5; background:#fff; }
  .page { max-width: 186mm; margin: 0 auto; padding: 0 2mm; }
  .cover { height: 260mm; display:flex; flex-direction:column; justify-content:center; break-after: page; }
  .cover .eyebrow { color: var(--accent); font-weight:700; letter-spacing:.08em; text-transform:uppercase; font-size:9pt; }
  .cover h1 { font-size: 30pt; line-height:1.15; margin: 8px 0 12px; }
  .cover p { color: var(--muted); font-size: 12pt; max-width: 150mm; }
  .legend { margin-top: 18px; border:1px solid var(--border); border-radius:8px; padding:10px 14px; font-size:10pt; }
  .legend span.hlbox { background: var(--hl); padding: 0 6px; border-radius: 3px; }
  .toc { break-after: page; }
  .toc ol { list-style:none; padding:0; columns: 2; column-gap: 10mm; }
  .toc li { padding: 2px 0; break-inside: avoid; }
  .toc li.lvl1 { font-weight:700; margin-top:6px; }
  .toc li.lvl2 { padding-left: 10px; color: var(--muted); }
  .toc .num { color: var(--accent); display:inline-block; min-width: 26px; }
  section.lvl1 { break-before: page; }
  h2 { font-size: 19pt; margin: 0 0 8px; border-bottom: 3px solid var(--accent); padding-bottom: 4px; }
  h3 { font-size: 13.5pt; margin: 18px 0 6px; color: #262a33; }
  h2 .num, h3 .num { color: var(--accent); margin-right: 6px; }
  p { margin: 6px 0; }
  code { font-family: Consolas, "Cascadia Code", monospace; font-size: 9pt; background: var(--code); border:1px solid var(--border); border-radius:4px; padding: 0 3px; }
  table { width:100%; border-collapse: collapse; margin: 8px 0 10px; font-size: 9.5pt; break-inside: auto; }
  th, td { text-align:left; vertical-align: top; padding: 4px 6px; border-bottom:1px solid var(--border); }
  th { background: #f3f4f8; color: var(--muted); font-weight: 600; }
  tr { break-inside: avoid; }
  table.files td:first-child { width: 48%; }
  .star { color: #c58a00; font-weight: 700; }
  .key { border-left: 4px solid var(--accent); background: var(--soft); border-radius: 6px; padding: 7px 11px; margin: 10px 0; break-inside: avoid; }
  ul.why { margin: 6px 0; }
  table.lessons th { background: #fdf3e2; }
  figure { margin: 10px 0; }
  figure.diagram { text-align:center; break-inside: avoid; border:1px solid var(--border); border-radius:8px; padding: 8px; }
  figure.diagram svg { height: auto; } /* keep Mermaid's natural max-width: don't blow up small diagrams */
  .steps { border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; margin: 10px 0; background: #fbfbfd; break-inside: avoid; }
  .steps-title { font-weight: 700; font-size: 9pt; color: var(--accent); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
  .steps ol { list-style: none; padding: 0; margin: 0; }
  .steps li { padding: 3px 0; border-bottom: 1px dashed var(--border); }
  .steps li:last-child { border-bottom: 0; }
  .steps .sn { display: inline-block; min-width: 44px; font-weight: 700; color: var(--accent); }
  .steps .where { color: var(--muted); font-size: 9pt; }
  figure.diagram figcaption { color: var(--muted); font-size: 9pt; margin-top: 4px; }
  pre.mermaid { margin:0; background:none; }
  figure.code { border:1px solid var(--border); border-radius:8px; overflow:hidden; break-inside: auto; }
  figure.code figcaption { display:flex; justify-content:space-between; background:#24292f; color:#e6edf3; font-family: Consolas, monospace; font-size: 8.5pt; padding: 4px 10px; }
  figure.code figcaption .lines { color:#9aa4b2; }
  figure.code pre { margin:0; padding: 6px 0; background: var(--code); font-family: Consolas, "Cascadia Code", monospace; font-size: 8.3pt; line-height: 1.42; white-space: pre-wrap; word-break: break-word; }
  .line { display:block; padding: 0 10px 0 0; }
  .line .ln { display:inline-block; width: 34px; text-align:right; padding-right: 8px; color:#9aa4b2; user-select:none; }
  .line.hl { background: var(--hl); box-shadow: inset 4px 0 0 #e0b400; }
  .code-note { font-size: 9pt; color: var(--muted); padding: 4px 10px; margin:0; border-top:1px solid var(--border); background:#fff; }
  pre.tree, pre.plain { font-family: Consolas, monospace; font-size: 8.4pt; background: var(--code); border:1px solid var(--border); border-radius: 8px; padding: 8px 10px; white-space: pre-wrap; line-height:1.4; }
  .small { font-size: 9pt; color: var(--muted); }
  ol.lessons-list li { margin: 3px 0; }
  .footer-note { color: var(--muted); font-size: 8.5pt; margin-top: 18px; }
</style>
</head>
<body>
<div class="page">
  <section class="cover">
    <div class="eyebrow">Support Triage AI · learning guide</div>
    <h1>From an empty folder to an approval-gated AI agent</h1>
    <p>Every step so far: diagrams first, then a plain explanation, then the real code (copied from the repository when this PDF was built). Built ${today}.</p>
    <div class="legend">
      <strong>How to read this guide</strong><br/>
      1 → 1.1 → 1.1.1: big step → sub-step → detail. Each step shows a <em>diagram</em>, <em>why</em>, the <em>files</em> involved and <em>code</em>.<br/>
      <span class="star">★</span> = file you should understand well. &nbsp; <span class="hlbox">yellow line</span> = the most important lines in a code block.
    </div>
  </section>
  ${renderToc()}
  ${body}
  <p class="footer-note">Generated by docs/guide/build-guide.mjs. Text notes per step: docs/learning/. Interactive diagrams: docs/visual/index.html.</p>
</div>
<script>
  // Syntax highlighting line by line, with line numbers and yellow highlights.
  document.querySelectorAll('figure.code pre').forEach(function (pre) {
    var lang = pre.dataset.lang;
    var start = Number(pre.dataset.start || 1);
    var hl = (pre.dataset.hl || '').split(',').filter(Boolean).map(Number);
    var lines = pre.textContent.split('\\n');
    pre.innerHTML = lines.map(function (line, i) {
      var html;
      try { html = hljs.getLanguage(lang) ? hljs.highlight(line, { language: lang, ignoreIllegals: true }).value : line.replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
      catch (e) { html = line.replace(/&/g,'&amp;').replace(/</g,'&lt;'); }
      return '<span class="line' + (hl.indexOf(i + 1) >= 0 ? ' hl' : '') + '"><span class="ln">' + (start + i) + '</span>' + (html || ' ') + '</span>';
    }).join('');
  });
  mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict', fontFamily: 'Segoe UI, sans-serif', flowchart: { curve: 'basis' } });
  mermaid.run({ querySelector: '.mermaid' }).then(function () { document.body.dataset.ready = '1'; });
</script>
</body>
</html>`;

writeFileSync(OUT_HTML, html);
console.log(`wrote ${OUT_HTML} (${sections.length} sections)`);

/* ------------------------------------------------------------------ PDF via headless Edge/Chrome */
if (process.argv.includes('--pdf')) {
  const candidates = [
    process.env.BROWSER_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const browser = candidates.find((p) => existsSync(p));
  if (!browser)
    throw new Error('No Edge/Chrome found. Set BROWSER_PATH, or open guide.html and print to PDF.');
  execFileSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-pdf-header-footer',
      '--print-to-pdf-no-header',
      '--virtual-time-budget=40000',
      `--print-to-pdf=${OUT_PDF}`,
      pathToFileURL(OUT_HTML).href,
    ],
    { stdio: 'ignore', timeout: 120_000 },
  );
  console.log(`wrote ${OUT_PDF}`);
}
