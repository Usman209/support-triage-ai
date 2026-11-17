# Step 01: Configuration and secrets

## 1. Goal

Put **every** secret and setting in one place (`.env`), check it when the app starts, and give the
code one typed `config` object. No hardcoded values anywhere.

## 2. What we built

| File                            | Purpose                                                                 |
| ------------------------------- | ----------------------------------------------------------------------- |
| `.env.example`                  | Template with every variable and a comment. Committed. No real secrets. |
| `.env`                          | Your real values. **Gitignored**, never committed.                      |
| `packages/shared/src/config.ts` | Loads `.env`, validates with Zod, exports `config`                      |
| `eslint.config.mjs` rule        | Blocks `process.env` everywhere except `config.ts`                      |

Variables are grouped: App, Database, LLM providers, RAG, Agent, Guardrails, Observability,
Cost/limits, Integrations, Feature flags, Object storage, Self-hosted Langfuse.

## 3. Why this way

- **12-Factor App rule: config lives in the environment.** The same code runs on your laptop,
  in CI and in production; only `.env` / environment variables change.
- **Fail fast.** If `API_PORT=abc` or `LLM_PROVIDER=gemini`, the app stops at startup with a clear
  message. Without this, you find the bug later, in a strange place.
- **One typed object.** `config.llm.temperature` is a `number`, `config.features.agentEnabled` is a
  `boolean`. Your editor autocompletes it. Raw `process.env` values are always `string | undefined`.
- **No defaults in code.** The value lives in `.env` only. If a default were also in code, you'd
  have two sources of truth and wouldn't know which one is used.
- **Secrets are optional for now, settings are required.** You can start the app before you have
  every API key. Later tasks make keys required when they are needed.
- **ESLint enforces the rule.** A rule that is only written in a README gets broken. A lint rule
  fails the build.

## 4. How it works

```
process starts
  -> config.ts searches upward from the current folder for .env
  -> process.loadEnvFile(.env)        (does NOT override variables already set, so CI/Docker win)
  -> Zod schema parses process.env
       "" (blank)       -> treated as missing
       "3011"           -> number 3011
       "true"/"false"   -> boolean
       bad value        -> throw Error with a readable list of problems
  -> export const config = { app, db, llm, rag, agent, guardrails, observability, ... }
```

Example error:

```
Invalid environment configuration (check your .env against .env.example):
✖ Invalid input: expected number, received NaN
  → at API_PORT
✖ Invalid option: expected one of "anthropic"|"openai"|"ollama"
  → at LLM_PROVIDER
```

## 5. Try it yourself

```bash
# break a value on purpose, then start the API: you get a clear error
# (set API_PORT=abc in .env, run pnpm dev:api, then set it back)
grep -rn "process.env" apps packages   # only config.ts should appear
```

## 6. Problems we faced

| Problem                                          | Cause                                                                    | Fix                                                                    | Lesson                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| Inline comments (`KEY=value # note`)             | Not every `.env` parser reads them the same way (Node vs Docker Compose) | Comments on their own line above each variable                         | Choose the format all your tools agree on                      |
| Empty values (`KEY=`) passed validation as `""`  | An empty string is still a string                                        | `blankToUndefined` preprocess step                                     | Treat blank as "not set"                                       |
| Same key twice in `.env` (`LANGFUSE_PUBLIC_KEY`) | Copy-paste; first copy empty, second had a value                         | Merged into one line                                                   | The **last** value wins in most loaders: duplicates hide bugs  |
| Updating `.env` without losing your values       | The file already had your real keys                                      | Script that only fills blank keys, keeps a backup, never prints values | Never overwrite someone's secrets; never print secrets in logs |
| Next.js client code can't read server config     | Client code runs in the browser; secrets must never go there             | `config` is server-only; pages read it in Server Components            | Never expose server secrets to the browser                     |

## 7. Interview questions

**Q: Where do you keep API keys?**
In environment variables, loaded from `.env` locally (gitignored) and from a secret manager in
production (for example Azure Key Vault or Kubernetes Secrets). Never in code or in git.

**Q: Why validate config at startup?**
Fail fast: a wrong setting should stop the app immediately with a clear message, not cause a
confusing error later in production.

**Q: What is `.env.example` for?**
Documentation and onboarding. It lists every variable with a safe placeholder so a new developer
knows what to set. It is committed; `.env` is not.

**Q: What if a secret was committed by mistake?**
Rotate (revoke and replace) the key first: deleting the commit is not enough because git history
and forks keep it. Then remove it from history and add a secret scanner (for example gitleaks) to CI.

**Q: Why Zod?**
TypeScript types disappear at runtime. Zod checks the real data at runtime and gives you the
TypeScript type from the same schema: one definition, two benefits.

## 8. Key takeaways

- One source of truth for settings: `.env`.
- Validate at the boundary (startup), then trust the typed object.
- Enforce rules with tools (ESLint), not only with documents.
