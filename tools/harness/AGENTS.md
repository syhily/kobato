# @kobato/harness — out-of-process instance harness

Everything that drives a kobato instance as a REAL separate process: SEA/dev-server lifecycles, per-run temp roots,
plain-SQL seeding, post-shutdown analytics verification, and the HTTP / oRPC / SMTP clients the live-instance suites
speak. `@kobato/test` keeps only in-process Vitest fixtures — a helper needing a socket, child process, or temp dir
lives HERE.

## Module map

- `process.ts` — `pickFreePort`, `fetchManual` (manual-redirect fetch), `scrubbedParentEnv`, `watchChildExit` /
  `raceChildExit`.
- `temp.ts` — `makeTempDirs()` per-run data/cache/cwd roots; `smokeDatabases(dirs)`.
- `sea-instance.ts` — the built SEA binary as an HTTP instance (`ensureBinaryExists`, `bootServer`, `waitForHttp`,
  `waitForExit`).
- `dev-instance.ts` — the repository DEV server (`writeDevConfig` — throwaway config, random secrets, 0600;
  `bootDevServer`; `stopDevServer` returns `'timeout'` so the caller owns the failure policy).
- `seed.ts` — plain-SQL state for STOPPED instances (no WAL contention): `seedInstalledInstance`, `relaxRateLimits` (the
  canonical relaxed bucket table spread from `@kobato/settings`), `readConvergedConfig`.
- `analytics.ts` — `scanAccessEvents`: opens the DuckDB sidecar AFTER shutdown (its close checkpoints the WAL).
- `http.ts` — `E2eClient` (cookie-jar fetch, manual redirects), the `KOBATO_E2E_*` env contract, CSRF extraction, real
  signin.
- `rpc.ts` — `callE2eRpc`: oRPC-over-HTTP with the `x-csrf-token` header; `path` is the camelCase structural router path
  (kebab-case `.route()` strings are OpenAPI metadata, not the RPC wire path).
- `smtp.ts` — `SmtpCapture` loopback capture server + `decodeMail` / OTP / magic-link extractors.

## Consumers and direction

`@kobato/pack` (smoke/e2e orchestrators) and `@kobato/trace` → harness; `@kobato/browser` → harness + pack;
`apps/kobato` `tests/e2e` and `tests/browser/support` import the client surfaces as `@kobato/harness/<name>.ts`.

The harness MUST NOT depend on `@kobato/pack` (pack depends on harness — the edge would cycle) and never imports the
app, server, or web packages: it drives built artifacts, not source graphs. Internal deps: `@kobato/settings` and
`@kobato/utils` only.

## Conventions

- The config file always lives inside the per-run temp root; config vars never come from the parent env (env > file
  would silently override the converged file); seeding only touches a STOPPED database; every caller's `finally`
  SIGTERMs the child and removes the temp root.
- No Vitest here: the SEA/browser entry scripts import `process` / `temp` / `sea-instance` / `seed` / `analytics` under
  plain `node` type-stripping — keep those modules free of non-strip TS syntax (no parameter properties, enums, or
  namespaces). `http` / `rpc` / `smtp` / `dev-instance` may use the full TS surface. Keep every module importable with
  zero side effects.
