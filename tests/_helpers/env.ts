// Centralised env defaults used by every test that pulls in `.server.ts`
// modules (which read `@/shared/env.server` at module-load time). Kept in
// sync with `tests/setup.ts` so individual tests can re-import it cheaply.

// Postgres base URL — the actual test database URL is created per-worker
// in `tests/setup.ts` via `createWorkerDatabase()`.
const POSTGRES_BASE_URL = 'postgres://test:test@localhost:5432/test'

// Redis URL mapped to a distinct database per Vitest worker (0–15)
// so parallel workers never share keys.
const workerId = Number(process.env.VITEST_WORKER_ID || '0')
const REDIS_DB = workerId % 16
const REDIS_URL = `redis://localhost:6379/${REDIS_DB}`

export const TEST_ENV = {
  DATABASE_URL: POSTGRES_BASE_URL,
  REDIS_URL,
  SESSION_SECRET: 'vitest-session-secret-must-be-at-least-32-chars-long-ok',
  ENCRYPTION_KEY: 'vitest-encryption-key-must-be-at-least-32-chars-long-ok',
  KOBATO_DATA_PATH: '/tmp/kobato-data',
} as const

export function ensureTestEnv(): void {
  // Always overwrite so that a `.env` file loaded by Vite/Vitest does
  // not leak production credentials into the test suite.
  for (const [key, value] of Object.entries(TEST_ENV)) {
    process.env[key] = value
  }
}

ensureTestEnv()
