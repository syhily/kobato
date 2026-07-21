import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  SEA_CLIENT_ASSET_PREFIX,
  SEA_DRIZZLE_ASSET_PREFIX,
  SEA_MANIFEST_KEY,
  SEA_NATIVE_ASSET_PREFIX,
  SEA_PROCESS_WORKER_BUNDLE_KEY,
  SEA_SERVER_BUNDLE_KEY,
  SEA_SMOKE_WORKER_BUNDLE_KEY,
  SEA_WASM_CNFS_KEY,
} from '@/shared/sea/assets'

// Contract test for the SEA embedded-asset keys. `src/shared/sea/assets.ts`
// is the single owner of the key contract: the writer
// (`scripts/sea/assets.ts`) and every runtime reader under `src/server/`
// must source their keys from it. A hardcoded key anywhere else only
// surfaces at `sea:smoke` time — these assertions catch the drift in the
// unit suite instead. No blob is built; this is source-level wiring plus
// value pinning.

const SHARED_MODULE = 'src/shared/sea/assets.ts'

/** Every module that writes or reads embedded assets, with the constants it must import. */
const PARTIES: { file: string; names: string[]; forbiddenLiterals: string[] }[] = [
  {
    file: 'scripts/sea/assets.ts',
    names: [
      'SEA_MANIFEST_KEY',
      'SEA_SERVER_BUNDLE_KEY',
      'SEA_PROCESS_WORKER_BUNDLE_KEY',
      'SEA_SMOKE_WORKER_BUNDLE_KEY',
      'SEA_WASM_CNFS_KEY',
      'SEA_CLIENT_ASSET_PREFIX',
      'SEA_DRIZZLE_ASSET_PREFIX',
      'SEA_NATIVE_ASSET_PREFIX',
    ],
    forbiddenLiterals: [
      `'manifest.json'`,
      `'server/server.mjs'`,
      `'worker/process-worker.cjs'`,
      `'worker/smoke-worker.cjs'`,
      `'wasm/cnfs.wasm'`,
    ],
  },
  {
    file: 'src/server/infra/sea-natives.ts',
    names: ['SEA_MANIFEST_KEY', 'SEA_SERVER_BUNDLE_KEY', 'SEA_SMOKE_WORKER_BUNDLE_KEY', 'SEA_NATIVE_ASSET_PREFIX'],
    forbiddenLiterals: [`'manifest.json'`, `'server/server.mjs'`, `'worker/smoke-worker.cjs'`, `'node_modules/'`],
  },
  {
    file: 'src/server/infra/image/process-pool.ts',
    names: ['SEA_PROCESS_WORKER_BUNDLE_KEY'],
    forbiddenLiterals: [`'worker/process-worker.cjs'`],
  },
  {
    file: 'src/server/render/warmup/manifest.ts',
    names: ['SEA_CLIENT_ASSET_PREFIX'],
    forbiddenLiterals: [`'client/assets/warmup-manifest.json'`, `'client/assets/manifest-'`],
  },
  {
    file: 'src/server/domains/fonts/vendor/wasm-split.ts',
    names: ['SEA_WASM_CNFS_KEY'],
    forbiddenLiterals: [`'wasm/cnfs.wasm'`],
  },
  {
    file: 'src/server/infra/db/migrate.ts',
    names: ['SEA_DRIZZLE_ASSET_PREFIX'],
    forbiddenLiterals: [`'drizzle/'`],
  },
  {
    file: 'src/server/infra/hono/node.ts',
    names: ['SEA_CLIENT_ASSET_PREFIX'],
    forbiddenLiterals: [`'client/'`],
  },
]

function readSource(path: string): string {
  return readFileSync(path, 'utf-8')
}

describe('contract: SEA embedded-asset keys', () => {
  it('pins the key and prefix values in the shared module', () => {
    expect(SEA_MANIFEST_KEY).toBe('manifest.json')
    expect(SEA_SERVER_BUNDLE_KEY).toBe('server/server.mjs')
    expect(SEA_PROCESS_WORKER_BUNDLE_KEY).toBe('worker/process-worker.cjs')
    expect(SEA_SMOKE_WORKER_BUNDLE_KEY).toBe('worker/smoke-worker.cjs')
    expect(SEA_WASM_CNFS_KEY).toBe('wasm/cnfs.wasm')
    expect(SEA_CLIENT_ASSET_PREFIX).toBe('client/')
    expect(SEA_DRIZZLE_ASSET_PREFIX).toBe('drizzle/')
    expect(SEA_NATIVE_ASSET_PREFIX).toBe('node_modules/')
  })

  it('writer and readers all import their keys from the shared module', () => {
    for (const { file, names } of PARTIES) {
      const source = readSource(file)
      expect(source, `${file} must import from the shared SEA assets module`).toContain('shared/sea/assets')
      for (const name of names) {
        expect(source, `${file} must reference ${name}`).toContain(name)
      }
    }
  })

  it('no writer or reader hardcodes a quoted asset key', () => {
    for (const { file, forbiddenLiterals } of PARTIES) {
      const source = readSource(file)
      for (const literal of forbiddenLiterals) {
        expect(source, `${file} must not hardcode ${literal} (owned by ${SHARED_MODULE})`).not.toContain(literal)
      }
    }
  })

  it('sea-natives no longer defines the manifest keys locally', () => {
    const source = readSource('src/server/infra/sea-natives.ts')
    // The constants must come from the shared module — a local definition
    // would fork the contract (the pre-shared-module bug shape).
    expect(source).not.toMatch(/(?:export\s+)?const\s+SEA_MANIFEST_KEY\s*=/)
    expect(source).not.toMatch(/(?:export\s+)?const\s+SEA_SERVER_BUNDLE_KEY\s*=/)
    expect(source).not.toMatch(/(?:export\s+)?const\s+SEA_SMOKE_WORKER_BUNDLE_KEY\s*=/)
    expect(source).not.toMatch(/(?:export\s+)?const\s+NATIVE_ASSET_PREFIX\s*=/)
    // And the values it uses are exactly the shared ones: importing the
    // names above from the shared module makes equality by construction.
    expect(source).toMatch(/import\s*\{[^}]*SEA_MANIFEST_KEY[^}]*\}\s*from\s*'@\/shared\/sea\/assets'/)
  })
})
