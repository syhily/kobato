# Server test conventions

- **`tests/unit/`** (`server-unit`) — pure server logic, no database. **`tests/it/`** (`server-it`) — integration tests
  needing a real database, mirroring `src/`: `packages/server/src/domains/posts/services/search-query.ts` →
  `packages/server/tests/it/server/domains/posts/services/search-query.test.ts`. Both projects are defined in
  `@kobato/test/projects/server-projects.ts`, registered by the root `@kobato/test/projects/registry.ts`, and run
  `isolate: true` — there is no shared/iso config pair and no mock-file scanning; every file gets a fresh module
  registry. Test files that spin up the real DuckDB engine live in `tests/it/` named `*.duckdb.test.ts` and run only in
  `server-duckdb` (own setup, per-file isolation).
- Test-only binary fixtures live under `tests/fixtures/` (the font-slicing canary owns `fixtures/fonts/`); never reach
  into `tools/test` by upward path.
- Cross-cutting integration tests live here under the primary domain they exercise — there is no `features/` bucket.
- Run with `pnpm test packages/server`; the root script includes unit, integration, and the DuckDB half.
- Tests exercising the real (unmocked) rate limiter call `__resetRateLimitsForTests()` from
  `@kobato/server/infra/rate-limit.ts` in `beforeEach` — the limiter is a process-level Map, so budgets otherwise leak
  across tests within a file.
- The unit/it setup wrappers clean scheduler state in `afterAll` through a dynamic `import()` of `scheduler-utils` — the
  setup must never statically import it (or anything reaching `lifecycle`/`job-run-recorder`): that would instantiate
  the product modules before a file's `vi.mock` registers and silently defeat the mock. `job-registry.test.ts` alone
  resets the job handle in its own `beforeEach`; the setup net must not (later tests rely on the import-time wiring).
- Database lifecycle, DuckDB sidecar, and the rest of the harness: server-owned `tests/utils/` helpers
  (`integration-db`, `analytics-db`, `mock-ctx`, etc.), also consumed by app route suites through the sanctioned
  cross-package helper seam; generic infrastructure comes from `@kobato/test` (see `tools/test/AGENTS.md`). Pure
  SQLite/Drizzle operations, migration tests, AND the DuckDB persistence/query modules' tests live in
  `packages/db/tests/`; server composition wiring, batchers, lifecycle, and SQLite-side maintenance stay here.
