# Test conventions

Conventions for the `tests/` directory.

## Layout

Tests are split into three Vitest workspace projects. **All three mirror the `src/` layout:**

- **`tests/unit/`** — Pure logic, no DB/Redis, fastest feedback loop.
  If you test `src/shared/utils/paths.ts`, the test lives at `tests/unit/shared/utils/paths.test.ts`.
- **`tests/it/`** — Integration / end-to-end tests that need real Postgres + Redis.
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

**One test file must not mix purposes.** If a file contains both unit tests (pure logic, mocks only) and integration tests (hits DB / Redis / real RPC), split it before moving:

- Unit tests go to `tests/unit/<mirrored-path>.test.ts`
- Integration tests go to `tests/it/<mirrored-path>.test.ts`
- Snapshot tests go to `tests/snaps/<mirrored-path>.test.tsx`

## Test utilities

- Import test utilities from `vitest`, not `vite-plus/test`.

## Infrastructure requirements

Only `tests/it/` is hard-dependent on real Postgres and Redis. `tests/unit/` and `tests/snaps/` skip the DB bootstrap entirely.

### Local development

Start the test infrastructure:

```bash
docker compose -f docker/docker-compose.test.yml up -d
```

Then run tests normally:

```bash
pnpm run test
```

Or run a single project:

```bash
npx vitest run --project unit
npx vitest run --project it
npx vitest run --project snaps
```

Services:

- `postgres-test` — PostgreSQL 17 (TimescaleDB), host port `5434` (container-internal `5432`)
- `redis-test` — Redis 7, host port `6381` (container-internal `6379`)

### CI

GitHub Actions already defines `postgres` and `redis` service containers in `.github/workflows/ci.yml`. No extra env vars are required.

### Worker isolation (integration only)

- **Postgres**: each worker gets its own database (`kobato_test_${workerId}_${timestamp}`), created by `tests/_helpers/integration-db.ts` and dropped in `afterAll`.
- **Redis**: `tests/_helpers/env.ts` maps `VITEST_WORKER_ID % 16` to a distinct Redis database (0–15).
- Tests that write tables should call `clearAllTables(db)` in `beforeEach` to reset state between cases within the same worker.
- Tests that write Redis should call `flushWorkerRedis()` in `beforeEach` to clear keys.

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
  - `#/_helpers/db` — query helpers (integration only)
  - `#/_helpers/mock-ctx` — mock auth context (integration only)
  - `#/_helpers/redis` — Redis helpers (integration only)
  - `#/_helpers/rpc-call` — oRPC test caller (integration only)
  - `#/_helpers/session` — session fixtures (integration only)
  - `#/_helpers/fetch` — fetch mocks (integration only)
  - `#/_helpers/comments-leaf` — provider factory for the three
    leaf-facing comments contexts (comment-item tests)
- `#/_helpers/e2e-client` — cookie-jar HTTP client + real signin (e2e only)
- `#/_helpers/e2e-rpc` — oRPC-over-HTTP caller (e2e only)
- `#/*` is mapped to `./tests/*` in `tsconfig.json` and resolved by Vitest.
- `@/*` continues to map to `src/*`.
