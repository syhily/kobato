# yufan.me — Linus Code Review

**Score: 6 / 10**
**Level: medium** (decent bones, but the stupid shit is REALLY stupid)

---

## 1. Strengths (concrete implementations, not platitudes)

- **Layer discipline is actually enforced.** `contract.boundaries.test.ts` (1215 lines) actively guards against `server/` → `shared/` value imports and retired dependency reintroduction. That's not common — most projects just write rules in a README and ignore them. You wrote a test that breaks CI if someone screws it up. Good.
- **Real database testing with per-worker isolation.** Fresh Postgres DB per Vitest worker (`yufan_test_${workerId}_${timestamp}`), Redis DB 0–15 mapped by worker ID. No mocking garbage. `clearAllTables` + `flushWorkerRedis` + `dropWorkerDatabase` cleanup. This is how you test a database app. Period.
- **oxlint with type-aware linting.** `typeAware: true`, `typeCheck: true`, barrel file ban enforced. Not ESLint garbage — actual production-grade static analysis. The config file is 200 lines of someone who gives a damn.
- **Auth architecture is sound.** Redis-backed sessions with parallel `session_meta:<sid>` HSET for admin management, `user_sessions:<userId>` set for global revocation. CSRF tokens, signed cookies, role hierarchy. Someone thought about session security instead of slapping JWT on everything and calling it a day.
- **Audit logging on every mutation path.** Append-only `audit_log` table with TimescaleDB hypertable for analytics. Rate limiting at both IP and email level. Slug registry for cross-table uniqueness. These are not afterthoughts — they're baked in.

---

## 2. Fatal Issues (would NAK in a merge window)

### P0 — `typescript: "^6.0.3"` in `package.json` line 134

**WHAT THE F*CK IS WRONG WITH YOU?**

TypeScript 6 DOES NOT EXIST. The latest stable release is 5.8.x. This is not a minor typo — this is a dependency declaration for a package version that has never been published. The only reason `npm ci` works right now is because your lockfile pins it to something that was probably installed when you had a different range. Delete `package-lock.json` and run `npm install` and watch the entire build explode.

This is not "oh we should fix that someday." This is **terminally broken packaging** that will fail on any fresh clone, any CI cache eviction, any Renovate PR. It will break deployments. It will break onboarding. It is a ticking time bomb in your most fundamental configuration file.

**Fix:** Change it to a real version. `~5.8.0` or whatever actually exists. Do it NOW.

---

### P0 — `globalThis.__viteDevServer` in server infrastructure

`src/server/infra/hono/dev.ts` line 149:
```ts
globalThis.__viteDevServer = server
```

And `src/server/infra/hono/node.ts` line 178:
```ts
} else if (globalThis.__viteDevServer?.httpServer) {
    const httpServer = globalThis.__viteDevServer.httpServer
```

**Are you actively trying to make things slower and more fragile?** You have a global mutable slot in your SERVER INFRASTRUCTURE code. This is not a dev-only convenience — `node.ts` reads it in the serve path. If something else mutates that global (plugin reload, worker thread, test runner), you get non-deterministic behavior that is impossible to debug.

"Pragmatic Vite pattern" my ass. Pragmatic would be passing the server reference through proper dependency injection or at least a module-level variable scoped to the file. `globalThis` is where you put things when you've given up on software engineering. This is voodoo programming.

**Fix:** Pass the dev server through Hono context or a properly scoped module. Stop polluting the global object.

---

### P0 — No `.dockerignore`

Your `Dockerfile` has `COPY . .` and there is **NO `.dockerignore`**. Do you understand what this means? `docker build` sends your ENTIRE working directory as build context — `.git` (hundreds of MB), `node_modules` (1.2GB), `coverage/` (7.3MB), `.env`, test files, editor configs, macOS `.DS_Store` garbage. You're probably shipping 1.5GB+ of context to the Docker daemon for a multi-stage build that only needs a fraction of it.

This is not a minor optimization. This is wasting disk, network, and CI minutes on EVERY BUILD. And it's a one-line fix.

**Fix:** `cp .gitignore .dockerignore` and add `drizzle/` if you copy it separately. Done. Not rocket science.

---

### P0 — `drizzle-orm` / `drizzle-kit` on release candidate for production database layer

`package.json` lines 82 and 127:
```json
"drizzle-orm": "~1.0.0-rc.3",
"drizzle-kit": "~1.0.0-rc.3"
```

Your ENTIRE data persistence layer is riding a release candidate. Not a point release — a **release candidate**. The `~1.0.0-rc.3` pin with `~` means you'll auto-upgrade to `rc.4` or whatever they push next, potentially with schema-breaking changes, migration bugs, or query regressions.

The latest stable Drizzle is 0.45.x. You're intentionally on the bleeding edge of a critical infrastructure dependency. This is not "acceptable if monitored" — this is Russian roulette with your database.

**Fix:** Pin to a stable version. If you need 1.0 features, wait for the stable release or pin EXACTLY with no range operator and review every changelog before upgrading.

---

### P0 — Schema monolith: 779 lines in a single file

`src/server/infra/db/schema.ts` is **779 lines**. Fifteen tables, enums, indexes, comments, relations — all crammed into one file. Your AGENTS.md says "When domain files exceed ~300 lines, they split into subdirectories." But `schema.ts` is 779 lines and nobody blinked.

This is not "at the upper bound of comfortable." This is a file that is **2.6x your own stated threshold** for splitting. Every schema change requires editing the same file, creating merge conflicts, and loading the entire schema into working memory. It's a bottleneck.

**Fix:** Split into `schema/tables.ts`, `schema/enums.ts`, `schema/relations.ts`, or per-domain schema files. You already do this for repos and services — apply the same rule to schema.

---

## 3. General Issues (acceptable but inelegant)

### P1 — Coverage excludes the user-facing parts of the app

`vitest.config.ts` excludes `src/routes/**/*.tsx` and `src/ui/**` from coverage. These are the ROUTES and UI COMPONENTS — the things your users actually interact with. You're measuring coverage on the backend plumbing while completely ignoring the frontend surface. That's like checking your car's engine oil but never looking at the tires.

### P1 — Duplicate `react-router typegen` in CI

`.github/workflows/ci.yml` runs `npx react-router typegen` explicitly, then `npm run typecheck` which ALSO runs `react-router typegen && tsc`. You're generating types twice per job. With a project this size that's probably 5–15 seconds of wasted CI time on every run. Multiply by PR count and you're burning hours.

### P1 — No npm cache in CI

No `actions/cache` for `node_modules`. 1.2GB of dependencies downloaded from scratch on every job. Fix your f*cking broken CI configuration.

### P1 — Console output in production code paths

`src/server/infra/hono/dev.ts` lines 201 and 264 have `console.error` and `console.warn`. This is infrastructure code. Use your logger (`hono-pino` is already a dependency). Console output bypasses structured logging, correlation IDs, and log levels. In production, this is noise.

### P1 — `render/` layer dynamically imports `ui/` — documented but still wrong

`src/server/render/feed/feed-pt-render.tsx` dynamically imports `@/ui/pt/render` to render PortableText for RSS. Yes, it's documented. Yes, it "only runs during SSR." But your AGENTS.md says `render/` produces "strings/buffers; never persists" and `server/*` must NOT import `ui/*`. You made an exception because you couldn't figure out how to render PT to HTML without React components.

**Fix:** Write a server-side PT-to-HTML renderer that doesn't depend on React. It's text nodes and mark annotations — not rocket science. Or accept that `render/` is not "strings/buffers" and stop pretending it is.

### P1 — `node:24-alpine` is bleeding edge

Node 24 was released April 2025. You're running it in production Docker. When Node 24.1 breaks something (and it will), you're the one debugging it at 3 AM. Use an LTS release like 22-alpine unless you have a specific feature requirement.

### P1 — 33 `.then`/`.catch` chains in server code

Mixed promise chains and async/await in the server codebase. Pick one pattern. Async/await everywhere. The `.then`/`.catch` chains are harder to read, harder to debug, and make error stack traces worse.

### P1 — Only one committed snapshot despite many snapshot test files

`tests/__snapshots__/` has one committed `.snap` file but 14+ `snapshot.*` test files. Either snapshot testing isn't configured properly, or you're generating uncommitted snapshots at runtime. If the latter, CI will fail when it can't find the baseline snapshots.

---

## 4. Worth Learning? (yes/no + specific reasons)

**Yes, with caveats.**

Worth learning from:
- The 5-layer architecture with explicit import rules
- Contract tests that enforce architectural boundaries
- Per-worker database isolation in tests
- Session management with Redis (multi-key pattern for metadata + revocation)
- Settings as per-section rows instead of monolithic JSONB
- Rate limiting at both IP and email granularity

NOT worth learning from:
- Global mutable state (`globalThis.__viteDevServer`)
- Riding RCs for critical infrastructure
- Letting schema files grow to 779 lines
- Excluding UI from coverage because "it's hard to test"

---

## 5. Production Ready? (yes/no + applicable scenarios)

**Yes, for a personal blog with low traffic.**

The architecture is sound enough that it won't fall over under normal load. The auth is properly implemented. The database design is thoughtful. The layer discipline prevents most accidental coupling.

**NO for anything with real stakes** because:
- `typescript: "^6.0.3"` will break fresh installs
- RC Drizzle could introduce schema/migration bugs
- No `.dockerignore` wastes CI resources and bloats images
- `globalThis.__viteDevServer` is a concurrency hazard waiting to happen
- User-facing code (routes, UI) has zero coverage measurement

---

## One-line verdict

**"needs work"** — The bones are good but the stupid shit is REALLY stupid. Fix the TypeScript version, fix the Docker build, pin your database ORM, and stop using `globalThis` as a dependency injection container. Then we'll talk.
