// Centralised env defaults used by every test that pulls in `.server.ts`
// modules (which read `@/shared/env.server` at module-load time). Kept in
// sync with `tests/setup.ts` so individual tests can re-import it cheaply.

// Postgres base URL — the actual test database URL is created per-worker
// in `tests/setup.ts` via `createWorkerDatabase()`.
const POSTGRES_BASE_URL = 'postgres://test:test@localhost:5434/test'

// Redis URL. All workers share DB 0; isolation is achieved via
// per-worker key prefixes rather than separate DB numbers (which
// overflow once there are more than 16 parallel workers).
const REDIS_URL = 'redis://localhost:6381'

const workerId = Number(process.env.VITEST_WORKER_ID || '0')
const REDIS_KEY_PREFIX = `test:w${workerId}:`

export const TEST_ENV = {
  DATABASE_URL: POSTGRES_BASE_URL,
  REDIS_URL,
  REDIS_KEY_PREFIX,
  SESSION_SECRET: 'vitest-session-secret-must-be-at-least-32-chars-long-ok',
  ENCRYPTION_KEY: 'vitest-encryption-key-must-be-at-least-32-chars-long-ok',
  DATA_PATH: '/tmp/kobato-data',
} as const

export function ensureTestEnv(): void {
  // Always overwrite so that a `.env` file loaded by Vite/Vitest does
  // not leak production credentials into the test suite.
  for (const [key, value] of Object.entries(TEST_ENV)) {
    process.env[key] = value
  }
}

ensureTestEnv()
