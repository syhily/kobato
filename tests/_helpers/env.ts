// Centralised env defaults used by every test that pulls in server
// modules (which read `@/server/infra/config` at module-load time).
// Imported by the per-project setup files so individual tests can
// re-import it cheaply.

// The single owner of test storage env: both databases are in-memory —
// integration tests share the lifecycle global per file, and file-backed
// flows (backup/restore) opt into temp files via `createTestDatabaseFile`.
export const TEST_ENV = {
  storage__database: ':memory:',
  storage__analyticsDatabase: ':memory:',
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
