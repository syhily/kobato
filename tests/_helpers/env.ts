// Centralised env defaults used by every test that pulls in server
// modules (which read `@/server/infra/config` at module-load time).
// Imported by the per-project setup files so individual tests can
// re-import it cheaply.

// In-memory placeholder — integration tests point `storage.database` at a
// per-worker temp FILE via `tests/it/setup.ts` (`createWorkerDatabase()`).
export const TEST_ENV = {
  storage__database: ':memory:',
  security__sessionSecret: 'vitest-session-secret-must-be-at-least-32-chars-long-ok',
  security__encryptionKey: 'vitest-encryption-key-must-be-at-least-32-chars-long-ok',
  storage__data: '/tmp/kobato-data',
  server__loggingLevel: 'silent',
} as const

export function ensureTestEnv(): void {
  // Always overwrite so that a `.env` file loaded by Vite/Vitest does
  // not leak production credentials into the test suite — EXCEPT
  // `storage__database`, which the integration setup assigns to a
  // per-worker temp file before this module is imported (the config
  // module freezes the value at first load, so the assignment must
  // win).
  for (const [key, value] of Object.entries(TEST_ENV)) {
    if (key === 'storage__database' && process.env[key] !== undefined) {
      continue
    }
    process.env[key] = value
  }
}

ensureTestEnv()
