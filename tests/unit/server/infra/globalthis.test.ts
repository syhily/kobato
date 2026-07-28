/**
 * Architectural invariant: the DI container must NOT store state on globalThis.
 *
 * The four modules that previously used globalThis (pool.ts, migrate.ts,
 * backends/s3.ts, snapshot.ts) must not reference it for singleton storage.
 * Standard browser API usages (crypto, location, document, navigator) are
 * exempt — those are runtime feature detection, not DI.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const DI_MODULES = [
  'src/server/infra/db/database.ts',
  'src/server/infra/db/migrate.ts',
  'src/server/infra/storage/backends/s3.ts',
  'src/shared/config/snapshot.ts',
] as const

// Pattern: `globalThis as typeof globalThis & { ... }` — the old DI anti-pattern.
const GLOBAL_THIS_CAST = /globalThis\s+as\s+typeof\s+globalThis\s*&/

describe('architectural invariant: no globalThis as DI container', () => {
  for (const path of DI_MODULES) {
    it(`${path} does not use globalThis as a DI slot`, () => {
      const content = readFileSync(path, 'utf-8')
      expect(content).not.toMatch(GLOBAL_THIS_CAST)
    })
  }
})
