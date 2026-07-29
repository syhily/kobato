# Test conventions

Conventions for the `tests/` directory.

## Layout

Tests are split into three Vitest workspace projects. **All three mirror the `src/` layout:**

- **`tests/unit/`** — Pure logic, no DB, fastest feedback loop.
  If you test `src/shared/utils/paths.ts`, the test lives at `tests/unit/shared/utils/paths.test.ts`.
- **`tests/it/`** — Integration / end-to-end tests that need a real database.
  If you test `src/server/domains/posts/services/cms-posts.ts`, the test lives at `tests/it/server/domains/posts/services/cms-posts.test.ts`.
- **`tests/snaps/`** — React SSR snapshot tests (render-to-string, no DB).
  If you test `src/ui/public/post/PostListViews.tsx`, the test lives at `tests/snaps/ui/public/post/post-list-views.test.tsx`.
- **`tests/e2e/`** — True HTTP e2e: tests drive a real kobato instance (the
  SEA binary booted by `scripts/sea/e2e.ts`) over plain `fetch`. No
  in-process shortcuts, no `vi.mock`, no direct DB access. **Not part of
  `pnpm test`** (the root config lists projects explicitly) — run it via
  `pnpm run sea:e2e`, which boots the instance and injects the
  `KOBATO_E2E_BASE_URL` / `KOBATO_E2E_ADMIN_EMAIL` /
  `KOBATO_E2E_ADMIN_PASSWORD` env contract.

Cross-cutting integration tests still live inside `tests/it/` under the primary domain they exercise — there is no `features/` bucket.

### Single-purpose rule

**One test file must not mix purposes.** If a file contains both unit tests (pure logic, mocks only) and integration tests (hits DB / real RPC), split it before moving:

- Unit tests go to `tests/unit/<mirrored-path>.test.ts`
- Integration tests go to `tests/it/<mirrored-path>.test.ts`
- Snapshot tests go to `tests/snaps/<mirrored-path>.test.tsx`

## Test utilities

- Import test utilities (`describe`, `it`, `expect`, `vi`) from `vitest`.

## Infrastructure requirements

Zero services. `tests/it/` runs on a shared in-memory SQLite database
per test file (`createTestDatabase()` returns the lifecycle global —
integration tests behave like unit tests with a real engine); flows
that need a real file (backup/restore, WAL assertions) opt into
`createTestDatabaseFile()` explicitly. Analytics tests use a per-run
DuckDB sidecar file (`tests/_helpers/analytics-db.ts`). `tests/unit/`
and `tests/snaps/` skip the DB bootstrap entirely.

### Local development

Run tests normally — no Docker, no env setup:

```bash
pnpm run test
```

Or run a single project:

```bash
npx vitest run --project unit
npx vitest run --project it
npx vitest run --project snaps
```

### CI

GitHub Actions needs no service containers — the suite is self-contained.

### Worker isolation (integration only)

- **SQLite**: one in-memory database per test file (`:memory:` is
  per-connection; the harness returns the lifecycle global so direct
  users and `getDb()` consumers share it; db-lifecycle migrates it at
  import). `closeTestDatabase` is a no-op on the global — its lifetime
  is the module graph's. `clearAllTables(db)` also resets
  `sqlite_sequence` so seeded ids restart at 1.
- **File-backed flows**: `createTestDatabaseFile()` returns a fresh
  migrated temp file — required for backup/restore (VACUUM INTO, file
  swaps) and WAL/pragma assertions.
- **DuckDB**: analytics tests open a per-run sidecar file via
  `createTestAnalyticsDb()` from `#/_helpers/analytics-db` and close it
  with `closeTestAnalyticsDb(handle)`.
- Tests that write tables should call `clearAllTables(db)` in `beforeEach` to reset state between cases within the same worker.
- Tests that exercise the real (unmocked) rate limiter should additionally call `__resetRateLimitsForTests()` from `@/server/infra/rate-limit` in `beforeEach` — the limiter is a process-level Map, so per-IP/email budgets otherwise leak across tests within a file.

## TypeScript pragmatism

Test code is not production code — its primary goal is to verify behavior, not to
model perfect types. Inside `tests/` (including mocks, spies, and fixtures),
strict type-checking may be relaxed when it would otherwise add unreasonable
ceremony:

- `any`, `as`, and `ts-expect-error` are acceptable escapes when a mock shape,
  test double, or fixture is intentionally partial or diverges from the real
  type.
- Prefer the narrowest escape possible; reach for `any` only after `as` or a
  partial type annotation proves too verbose.

## Imports

- **All test utilities live in `tests/_helpers/`** — there is no `tests/it/_helpers/` or per-project helpers directory.
- Import helpers using the `#/_helpers/<name>` alias:
  - `#/_helpers/catalog` — mock data factories
  - `#/_helpers/render` — SSR render helpers (snapshots)
  - `#/_helpers/blog-settings` — test settings bundle
  - `#/_helpers/integration-db` — DB creation / teardown (integration only)
  - `#/_helpers/analytics-db` — DuckDB sidecar creation / seeding / teardown
    (analytics integration tests)
  - `#/_helpers/db` — query helpers (integration only)
  - `#/_helpers/mock-ctx` — mock auth context (integration only)
  - `#/_helpers/request-context` — `makeRequestContext`, the single
    canonical `RequestContext` stub factory (never hand-roll rc literals;
    safe to import from `vi.mock('@/server/http/request-context', …)`
    factories — no runtime edge to the mocked module)
  - `#/_helpers/context` — `makeRouteContext` / `makeLoaderArgs` wrappers
    that set the stub on a `RouterContextProvider` for direct loader/action
    tests
  - `#/_helpers/auth-context-mock` — `createRequestContextMockModule()` for
    `vi.mock('@/server/http/request-context', ...)` when a test invokes a
    handler without a real `RouterContextProvider`
  - `#/_helpers/rpc-call` — oRPC test caller (integration only)
  - `#/_helpers/session` — session fixtures (integration only)
  - `#/_helpers/fetch` — fetch mocks (integration only)
  - `#/_helpers/comments-leaf` — provider factory for the three
    leaf-facing comments contexts (comment-item tests)
- `#/_helpers/e2e-client` — cookie-jar HTTP client + real signin (e2e only)
- `#/_helpers/e2e-rpc` — oRPC-over-HTTP caller (e2e only)
- `#/*` is mapped to `./tests/*` in `tsconfig.json` and resolved by Vitest.
- `@/*` continues to map to `src/*`.
