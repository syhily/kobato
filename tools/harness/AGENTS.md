# @kobato/harness — out-of-process instance harness

Everything that drives a kobato instance as a REAL separate process: the SEA
binary lifecycle, the DEV-server (`react-router dev`) lifecycle, per-run temp
roots, plain-SQL instance seeding, post-shutdown analytics verification, and
the HTTP / oRPC / SMTP clients the live-instance suites speak. `@kobato/test`
keeps only in-process Vitest fixtures and doubles — if a helper needs a
socket, a child process, or a temp dir, it lives HERE.

## Module map

- `process.ts` — generic child-process primitives: `fail`, `sleep`,
  `pickFreePort`, `fetchManual` (manual-redirect fetch with a timeout),
  `scrubbedParentEnv` (parent env minus `__` config vars and `KOBATO_*`;
  `drop` adds case-specific exclusions), `watchChildExit` / `raceChildExit`
  (bounded exit race, SIGKILL on deadline).
- `temp.ts` — `makeTempDirs()` per-run data/cache/cwd root under the OS temp
  dir; `smokeDatabases(dirs)` maps it to the canonical
  `kobato.db` / `analytics.duckdb` paths.
- `sea-instance.ts` — the built SEA binary as an HTTP instance:
  `ensureBinaryExists`, `bootServer` (config file inside the temp root,
  output piped to a log stream, `server__port` injected), `waitForHttp`
  (poll ANY status until the boot deadline), `waitForExit`.
- `dev-instance.ts` — the repository DEV server: `writeDevConfig` (throwaway
  config, random secrets, mode 0600), `bootDevServer` (`pnpm exec react-router
  dev` from a caller-supplied repo root, /health polling),
  `stopDevServer` (SIGTERM + bounded race; returns `'timeout'` instead of
  exiting so the caller owns the failure policy).
- `seed.ts` — plain-SQL state for STOPPED instances (no WAL contention):
  `seedInstalledInstance` (one admin row — `hasAdmin()` is the whole install
  gate — plus the `blog.general` / `blog.assets` roots; `title` /
  `description` / `website` options cover the dev-smoke identity),
  `relaxRateLimits` (the ONE canonical relaxed bucket table, spread from
  `@kobato/settings` `rateLimitDefaults`), `readConvergedConfig`.
- `analytics.ts` — `scanAccessEvents`: open the DuckDB sidecar AFTER shutdown
  (its close checkpoints the WAL) and count `access_events`.
- `http.ts` — `E2eClient` (cookie-jar fetch client, manual redirects),
  `e2eEnv` (the `KOBATO_E2E_*` env contract), CSRF extraction, real signin.
- `rpc.ts` — `callE2eRpc`: oRPC-over-HTTP, same wire format as
  the package-local `packages/server/tests/utils/rpc-call.ts` plus the `x-csrf-token` header `/rpc/*` requires.
  `path` is the camelCase structural router path (kebab-case `.route()` strings are
  OpenAPI metadata, not the RPC wire path), and void-output procedures answer `{}`
  with no `json` key.
- `smtp.ts` — `SmtpCapture` loopback capture server (just enough SMTP for
  nodemailer's plaintext path) + `decodeMail` / OTP / magic-link extractors.

## Consumers and direction

- `@kobato/pack` (smoke / e2e orchestrators) → harness; pack keeps the build,
  inject, budget, bundle-check pipeline and the entry scripts.
- `@kobato/browser` (journey runner) → harness + pack (`pack/sea/paths.ts`
  owns the repo-root/binary path grammar, `pack/sea/exec.ts` the fail-fast
  spawn helpers).
- `@kobato/trace` (OpenObserve DEV tooling) → harness for the dev-instance /
  process / HTTP / RPC seams; ALL Docker and OpenObserve logic stays in
  `@kobato/trace`.
- `apps/kobato` `tests/e2e` and `tests/browser/support` import the client
  surfaces as `@kobato/harness/<name>.ts`.

The harness MUST NOT depend on `@kobato/pack` (pack depends on harness — the
edge would be a cycle), and it must never import the app, server, or web
packages: it drives built artifacts, not source graphs. The only internal
deps are `@kobato/settings` (the canonical rate-limit bucket table) and
`@kobato/utils` (type guards).

## Conventions

- Boot / health-check / seed / cleanup semantics are shared and pinned: the
  config file always lives inside the per-run temp root, config vars never
  come from the parent env (env > file would silently override the converged
  file), seeding only touches a STOPPED database, and every caller's
  `finally` SIGTERMs the child and removes the temp root.
- No Vitest here: the SEA/browser entry scripts import `process` / `temp` /
  `sea-instance` / `seed` / `analytics` under plain `node` type-stripping —
  keep those modules free of non-strip TS syntax (no parameter properties,
  enums, or namespaces). `http` / `rpc` / `smtp` / `dev-instance` are consumed
  through transforming runners (vitest, Playwright, vite-node) and may use the
  full TS surface. Keep every module importable with zero side effects.
