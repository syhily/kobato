# Server test conventions

- **`tests/unit/`** (`server-unit`) — pure server logic, no database.
- **`tests/it/`** (`server-it`) — integration tests needing a real database, mirroring `src/`: `packages/server/src/domains/posts/services/cms-posts.ts` → `packages/server/tests/it/server/domains/posts/services/cms-posts.test.ts`.
- Cross-cutting integration tests live here under the primary domain they exercise — there is no `features/` bucket.
- Run with `npx vitest run --project server-unit` / `--project server-it`.
- Tests that exercise the real (unmocked) rate limiter should call `__resetRateLimitsForTests()` from `@kobato/server/infra/rate-limit.ts` in `beforeEach` — the limiter is a process-level Map, so per-IP/email budgets otherwise leak across tests within a file.
- Database lifecycle, DuckDB sidecar, and the rest of the harness: `@kobato/test` (see `packages/tools/test/AGENTS.md`). Pure SQLite/Drizzle operation tests live in `packages/db/tests/`; server-owned migration adapters, batchers, diagnostics, and maintenance stay here.
