# Step 00: Project skeleton

## 1. Goal

Create the folder structure and tooling **before** writing features, so every later task has a clear
home and the same quality checks.

## 2. What we built

| Piece        | File(s)                                                        | Purpose                                                   |
| ------------ | -------------------------------------------------------------- | --------------------------------------------------------- |
| Monorepo     | `pnpm-workspace.yaml`, root `package.json`                     | Many apps/packages in one repo                            |
| TypeScript   | `tsconfig.base.json` + one `tsconfig.json` per package         | Strict type checking everywhere                           |
| Lint         | `eslint.config.mjs`                                            | Code rules (and our "no process.env" rule)                |
| Format       | `.prettierrc.json`, `.prettierignore`                          | Same code style for everyone                              |
| Editor/Git   | `.editorconfig`, `.gitattributes`, `.gitignore`                | LF line endings, ignore secrets and build output          |
| CI           | `.github/workflows/ci.yml`                                     | Runs install, lint, format check, typecheck on every push |
| Placeholders | `apps/`, `packages/`, `services/`, `evals/`, `infra/`, `docs/` | One TODO comment per file, tagged with its task           |

Folder map:

```
apps/web          Next.js UI (chat, approvals, dashboard)
apps/api          Hono HTTP API
packages/shared   config loader, Zod schemas, types
packages/ai       LLM layer: providers, prompts, RAG, tools, agents
packages/db       Drizzle schema + migrations
services/py-*     Python helpers (evals, document parsing)
evals/promptfoo   eval suites
infra/            docker, terraform, helm
data/             raw (gitignored), sample, knowledge-base
```

## 3. Why this way

- **Monorepo with pnpm workspaces**: the web app and API share the same types and config. One
  `pnpm install`, one lint, one typecheck. pnpm is fast and strict: a package can only use
  dependencies it declares.
- **Packages by responsibility**: `ai` does not know about HTTP; `api` does not know how RAG works.
  This is **separation of concerns**. It makes testing and replacing parts easy (for example, swap
  Anthropic for OpenAI inside `packages/ai/providers` only).
- **Internal packages export TypeScript source** (`"exports": "./src/index.ts"`): no build step for
  shared code. Fast feedback. The web app must be told to compile them (`transpilePackages`).
- **TypeScript strict + `noUncheckedIndexedAccess`**: catches `undefined` bugs at compile time. AI
  code handles a lot of unknown data (model output, CSV rows), so this matters.
- **Placeholders tagged with a task number**: you can search `TODO task 3` and see all the work for
  RAG. The structure is a plan you can read.
- **Python only where it is best** (Ragas, DeepEval, Docling): everything else is TypeScript.

## 4. How it works

`pnpm typecheck` = `tsc` on the root scripts, then `pnpm -r typecheck` runs `tsc --noEmit` in
every package. `pnpm lint` runs ESLint once over the whole repo. CI runs the same commands.

## 5. Try it yourself

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm format:check
grep -r "TODO task 3" apps packages   # see all RAG work
```

## 6. Problems we faced

| Problem                                                                               | Cause                                                                 | Fix                                                                          | Lesson                                                                   |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A file with only a comment can fail with "cannot be compiled under --isolatedModules" | TypeScript treats a file with no `import`/`export` as a global script | `"moduleDetection": "force"` in `tsconfig.base.json`                         | Know why a tsconfig option is there, don't copy blindly                  |
| Next.js can't use `.ts` files from workspace packages                                 | Next only compiles its own folder by default                          | `transpilePackages: ['@sta/shared']` in `next.config.mjs`                    | Internal packages without a build step need the consumer to compile them |
| `pnpm format:check` failed on 5 files                                                 | Files were written before Prettier ran                                | `pnpm format`                                                                | Run the formatter before committing; CI will catch it otherwise          |
| No lockfile at first, so CI can't use `--frozen-lockfile`                             | Dependencies not installed yet                                        | Install once, commit `pnpm-lock.yaml`, then switch CI to `--frozen-lockfile` | Lockfiles make builds repeatable                                         |

## 7. Interview questions

**Q: Why a monorepo?**
Shared code (types, config, schemas) changes together with the apps that use it. One PR can change
the API and the UI safely. Tools like pnpm workspaces make it cheap.

**Q: What is the downside of a monorepo?**
CI can get slow as the repo grows and permissions are coarse. Fix with caching and "only test
what changed" tools (Turborepo, Nx).

**Q: Why pnpm and not npm?**
Faster, saves disk (one store, hard links), and strict: you cannot import a package you didn't
declare, which avoids "works on my machine" bugs.

**Q: Why strict TypeScript in an AI project?**
LLM output and external data are untrusted and often shaped differently than expected. Strict
types plus runtime validation (Zod) catch these bugs early.

**Q: Why separate `packages/ai` from `apps/api`?**
Separation of concerns. The AI layer can be reused by scripts (ingest, eval) and tested without
an HTTP server.

## 8. Key takeaways

- Structure first, features second.
- Every package has one job.
- The same checks run locally and in CI.
