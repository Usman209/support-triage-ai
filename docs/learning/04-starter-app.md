# Step 04: Starter app (API + web shell)

## 1. Goal

Get real URLs working end to end (browser -> web -> API) before adding AI features.

## 2. What we built

| URL                                                    | What                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| http://localhost:3011/health                           | API health: `{"status":"ok","service":...,"env":...,"time":...}` |
| http://localhost:3010                                  | Home page: links + live API status                               |
| http://localhost:3010/chat, `/approvals`, `/dashboard` | Placeholder pages for tasks 3, 4, 10                             |

Files:

- API: `apps/api/src/index.ts` (start server), `app.ts` (middleware + routes), `routes/health.ts`
- Web: `apps/web/src/app/layout.tsx` (nav), `page.tsx` (home), `chat|approvals|dashboard/page.tsx`
- `apps/web/scripts/next.ts`: starts Next.js on the port from config
- New setting `API_URL` in `.env` (where the web app finds the API)

## 3. Why this way

- **Hono for the API**: small, fast, TypeScript-first, built on web standards (`Request`/`Response`),
  runs on Node, Bun, edge and serverless. Good fit for a JSON API that streams LLM output.
- **Next.js App Router**: Server Components can call the API and read server config safely; the
  browser never sees secrets.
- **Health endpoint first**: Docker, Kubernetes and load balancers use it to know if the service is
  alive. It is also the simplest way to prove the wiring works.
- **Server-side fetch on the home page**: the API status is fetched on the server, so no CORS setup
  is needed yet and the API URL stays server-side.
- **Ports from config**: Next.js does not read our `.env` for its port, so a tiny launcher script
  reads `config.app.webPort` and starts `next dev --port <port>`.

## 4. How it works

```
browser -> GET http://localhost:3010/
  Next.js server renders page.tsx (Server Component)
    -> fetch(config.app.apiUrl + "/health")   (server to server)
    <- {"status":"ok", ...}
  HTML with "API status: online" -> browser
```

## 5. Try it yourself

```bash
pnpm dev:api     # terminal 1
pnpm dev:web     # terminal 2
curl http://localhost:3011/health
# stop the API and refresh the home page: status shows "offline"
```

## 6. Problems we faced

| Problem                          | Cause                                               | Fix                                                            | Lesson                                              |
| -------------------------------- | --------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| No app URL to open               | The skeleton had only TODO comments                 | Built a minimal API + web shell                                | Get a "walking skeleton" running early              |
| Ports 3000 and 3001 already used | Other local containers (Metabase, another backend)  | `WEB_PORT=3010`, `API_PORT=3011` in `.env`                     | Check ports before choosing; make them configurable |
| Next.js ignores `WEB_PORT`       | Next only reads `PORT` or the `--port` flag         | Launcher script `scripts/next.ts`                              | Bridge tools to your config instead of hardcoding   |
| First page load took ~13 seconds | Next.js compiles pages on first request in dev mode | Nothing; later loads are fast. Production build is precompiled | Dev mode speed is not production speed              |

## 7. Interview questions

**Q: What is a walking skeleton?**
The thinnest end-to-end version of the system that runs and is deployable. You add features to a
working system instead of integrating everything at the end.

**Q: Liveness vs readiness endpoint?**
Liveness (`/health`): the process is up. Readiness (`/health/ready`, task 3): dependencies like the
database and LLM provider are reachable, so it can take traffic.

**Q: Server Component vs Client Component?**
Server Components render on the server, can read secrets and call internal services, and send
only HTML. Client Components run in the browser for interactivity (the chat input will be one).

**Q: Why Hono over Express?**
TypeScript-first, faster, web-standard APIs, works on many runtimes, built-in streaming helpers.
Express is fine too; it is older and Node-only.

## 8. Key takeaways

- Make it run end to end first, then add features.
- Health endpoints are a basic production requirement.
- Keep secrets and internal URLs on the server.
