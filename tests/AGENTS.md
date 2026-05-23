# Test conventions

Conventions for the `tests/` directory.

## Test utilities

- Import test utilities from `vitest`, not `vite-plus/test`.

## Infrastructure requirements

Tests are **hard-dependent** on real Postgres and Redis. Every Vitest worker
automatically creates a fresh database via `tests/setup.ts` before any test
file runs.

### Local development

Start the test infrastructure:

```bash
docker compose -f docker-compose.test.yml up -d
```

Then run tests normally:

```bash
npm run test
```

Services:

- `postgres-test` — PostgreSQL 17 (TimescaleDB), port `5432`
- `redis-test` — Redis 7, port `6379`

### CI

GitHub Actions already defines `postgres` and `redis` service containers in
`.github/workflows/ci.yml`. No extra env vars are required.

### Worker isolation

- **Postgres**: each worker gets its own database (`yufan_test_${workerId}_${timestamp}`), created by `tests/_helpers/integration-db.ts` and dropped in `afterAll`.
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

- Relative imports are acceptable inside `tests/`. Do not enforce the `@/*`
  alias requirement that applies to `src/` code. Use whichever path keeps the
  test file readable and self-contained.
