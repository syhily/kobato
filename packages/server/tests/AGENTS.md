# Server test conventions

- **`tests/unit/`** (`server-unit`) — pure server logic, no database.
- Test-only binary fixtures live under `tests/fixtures/` (the font-slicing canary owns `fixtures/fonts/`); never reach into `tools/test` by upward path.
- **`tests/it/`** (`server-it`) — integration tests needing a real database, mirroring `src/`: `packages/server/src/domains/posts/services/search-query.ts` → `packages/server/tests/it/server/domains/posts/services/search-query.test.ts`.
- Cross-cutting integration tests live here under the primary domain they exercise — there is no `features/` bucket.
- Run with `npx vitest run --project server-unit` / `--project server-it`.
- Tests that exercise the real (unmocked) rate limiter should call `__resetRateLimitsForTests()` from `@kobato/server/infra/rate-limit.ts` in `beforeEach` — the limiter is a process-level Map, so per-IP/email budgets otherwise leak across tests within a file.
- Database lifecycle, DuckDB sidecar, and the rest of the harness: `@kobato/test` (see `tools/test/AGENTS.md`). Pure SQLite/Drizzle operations, migration tests, AND the DuckDB persistence/query modules' tests (engine handle, DDL/appenders, retention, blob migration, dashboard reads) live in `packages/db/tests/`; server composition wiring, batchers, lifecycle, and SQLite-side maintenance stay here. Files touching the real DuckDB engine belong to the dedicated `duckdb` project wherever they live — keep the list in `@kobato/test/duckdb-files.ts` exact.
