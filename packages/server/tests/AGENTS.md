# Server test conventions

- `tests/unit/` (`server-unit`) covers pure server logic with no database; `tests/it/` (`server-it`) covers integration
  tests needing a real database and mirrors `src/` (`src/domains/posts/services/search-query.ts` →
  `tests/it/server/domains/posts/services/search-query.test.ts`). Both are defined in
  `@kobato/test/projects/server-projects.ts` and run `isolate: true`. Files that spin up the real DuckDB engine live in
  `tests/it/` named `*.duckdb.test.ts` and run only in `server-duckdb`.
- Test-only binary fixtures live under `tests/fixtures/` (the font-slicing canary owns `fixtures/fonts/`); never reach
  into `tools/test` by upward path.
- Cross-cutting integration tests live here under the primary domain they exercise — there is no `features/` bucket. Run
  with `pnpm test packages/server`.
- Tests exercising the real (unmocked) rate limiter call `__resetRateLimitsForTests()` from
  `@kobato/server/infra/rate-limit.ts` in `beforeEach` — the limiter is a process-level Map, so budgets otherwise leak
  across tests within a file.
- The unit/it setup wrappers clean scheduler state in `afterAll` through a dynamic `import()` of `scheduler-utils` and
  must never statically import it (or anything reaching `lifecycle`/`job-run-recorder`): a static import would
  instantiate the product modules before a file's `vi.mock` registers and silently defeat the mock.
- Server-owned `tests/utils/` helpers own the database lifecycle and DuckDB sidecar and are also consumed by app route
  suites through the sanctioned cross-package helper seam; generic infrastructure comes from `@kobato/test`. Pure
  SQLite/Drizzle operations, migration tests, and the DuckDB persistence/query modules' tests live in
  `packages/db/tests/`; server composition wiring, batchers, lifecycle, and SQLite-side maintenance stay here.
