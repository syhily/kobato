// Centralised env defaults for every test that pulls in server modules
// (which read `@/server/infra/config` at module-load time); imported by
// the per-project setup files.

// The single owner of test storage env (both databases in-memory by default).
export const TEST_ENV = {
  storage__database: ':memory:',
  storage__analyticsDatabase: ':memory:',
  security__sessionSecret: 'vitest-session-secret-must-be-at-least-32-chars-long-ok',
  security__encryptionKey: 'vitest-encryption-key-must-be-at-least-32-chars-long-ok',
  storage__data: '/tmp/kobato-data',
  server__loggingLevel: 'silent',
} as const

export function ensureTestEnv(): void {
  // Always overwrite: a Vite/Vitest-loaded `.env` must not leak production credentials.
  for (const [key, value] of Object.entries(TEST_ENV)) {
    process.env[key] = value
  }
}

ensureTestEnv()
