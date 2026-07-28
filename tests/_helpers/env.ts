// Centralised env defaults used by every test that pulls in server
// modules (which read `@/server/infra/config` at module-load time).
// Imported by the per-project setup files so individual tests can
// re-import it cheaply.

// Postgres base URL — the actual test database URL is created per-worker
// in `tests/it/setup.ts` via `createWorkerDatabase()`.
const POSTGRES_BASE_URL = 'postgres://test:test@localhost:5434/test'

export const TEST_ENV = {
  database__url: POSTGRES_BASE_URL,
  security__sessionSecret: 'vitest-session-secret-must-be-at-least-32-chars-long-ok',
  security__encryptionKey: 'vitest-encryption-key-must-be-at-least-32-chars-long-ok',
  storage__data: '/tmp/kobato-data',
  server__loggingLevel: 'silent',
} as const

export function ensureTestEnv(): void {
  // Always overwrite so that a `.env` file loaded by Vite/Vitest does
  // not leak production credentials into the test suite.
  for (const [key, value] of Object.entries(TEST_ENV)) {
    process.env[key] = value
  }
}

ensureTestEnv()
