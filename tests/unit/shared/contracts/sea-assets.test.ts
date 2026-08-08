import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  SEA_CLIENT_ASSET_PREFIX,
  SEA_DRIZZLE_ASSET_PREFIX,
  SEA_MANIFEST_KEY,
  SEA_NATIVE_ASSET_PREFIX,
  SEA_NATIVE_META_LIBVIPS_PACKAGE_KEY,
  SEA_NATIVE_META_LIBVIPS_VERSIONS_KEY,
  SEA_NATIVE_META_SHARP_PACKAGE_KEY,
  SEA_NATIVE_META_SHARP_VERSIONS_KEY,
  SEA_NATIVE_SHARP_ADDON_KEY,
  SEA_NATIVE_SKIA_ADDON_KEY,
  SEA_NATIVE_SKIA_ICU_KEY,
  SEA_PROCESS_WORKER_BUNDLE_KEY,
  SEA_SMOKE_WORKER_BUNDLE_KEY,
  SEA_WASM_CNFS_KEY,
} from '@/shared/sea/assets'

// Contract test for the SEA embedded-asset keys: writer and readers must
// source every key from `src/shared/sea/assets.ts`. A hardcoded key only
// surfaces at `sea:smoke` time — this pins the drift in the unit suite.

const SHARED_MODULE = 'src/shared/sea/assets.ts'

const PARTIES: { file: string; names: string[]; forbiddenLiterals: string[] }[] = [
  {
    file: 'scripts/sea/assets.ts',
    names: [
      'SEA_MANIFEST_KEY',
      'SEA_PROCESS_WORKER_BUNDLE_KEY',
      'SEA_SMOKE_WORKER_BUNDLE_KEY',
      'SEA_WASM_CNFS_KEY',
      'SEA_CLIENT_ASSET_PREFIX',
      'SEA_DRIZZLE_ASSET_PREFIX',
      'SEA_NATIVE_ASSET_PREFIX',
      'SEA_NATIVE_SHARP_ADDON_KEY',
      'SEA_NATIVE_SKIA_ADDON_KEY',
      'SEA_NATIVE_SKIA_ICU_KEY',
      'SEA_NATIVE_META_LIBVIPS_VERSIONS_KEY',
      'SEA_NATIVE_META_LIBVIPS_PACKAGE_KEY',
      'SEA_NATIVE_META_SHARP_PACKAGE_KEY',
      'SEA_NATIVE_META_SHARP_VERSIONS_KEY',
    ],
    forbiddenLiterals: [
      `'manifest.json'`,
      `'server/server.mjs'`,
      `'worker/process-worker.mjs'`,
      `'worker/smoke-worker.mjs'`,
      `'wasm/cnfs.wasm'`,
      `'natives/sharp.node'`,
      `'natives/skia.node'`,
      `'natives/icudtl.dat'`,
      `'natives-meta/`,
    ],
  },
  {
    file: 'src/server/infra/sea.ts',
    names: ['SEA_MANIFEST_KEY'],
    forbiddenLiterals: [`'manifest.json'`],
  },
  {
    file: 'src/server/infra/sea-natives.ts',
    names: ['SEA_MANIFEST_KEY', 'SEA_NATIVE_ASSET_PREFIX'],
    forbiddenLiterals: [`'manifest.json'`, `'natives/'`],
  },
  {
    file: 'src/server/infra/sea-cli.ts',
    names: ['SEA_SMOKE_WORKER_BUNDLE_KEY'],
    forbiddenLiterals: [`'worker/smoke-worker.mjs'`],
  },
  {
    file: 'src/server/infra/native-require.ts',
    names: [
      'SEA_NATIVE_ASSET_PREFIX',
      'SEA_NATIVE_SHARP_ADDON_KEY',
      'SEA_NATIVE_SKIA_ADDON_KEY',
      'SEA_NATIVE_META_LIBVIPS_VERSIONS_KEY',
      'SEA_NATIVE_META_LIBVIPS_PACKAGE_KEY',
      'SEA_NATIVE_META_SHARP_PACKAGE_KEY',
      'SEA_NATIVE_META_SHARP_VERSIONS_KEY',
    ],
    forbiddenLiterals: [
      `'natives/'`,
      `'natives/sharp.node'`,
      `'natives/skia.node'`,
      `'natives-meta/libvips-versions.json'`,
      `'natives-meta/libvips-package.json'`,
      `'natives-meta/sharp-platform-package.json'`,
      `'natives-meta/sharp-platform-versions.json'`,
    ],
  },
  {
    file: 'src/server/infra/image/process-pool.ts',
    names: ['SEA_PROCESS_WORKER_BUNDLE_KEY'],
    forbiddenLiterals: [`'worker/process-worker.mjs'`],
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
    expect(SEA_PROCESS_WORKER_BUNDLE_KEY).toBe('worker/process-worker.mjs')
    expect(SEA_SMOKE_WORKER_BUNDLE_KEY).toBe('worker/smoke-worker.mjs')
    expect(SEA_WASM_CNFS_KEY).toBe('wasm/cnfs.wasm')
    expect(SEA_CLIENT_ASSET_PREFIX).toBe('client/')
    expect(SEA_DRIZZLE_ASSET_PREFIX).toBe('drizzle/')
    expect(SEA_NATIVE_ASSET_PREFIX).toBe('natives/')
    expect(SEA_NATIVE_SHARP_ADDON_KEY).toBe('natives/sharp.node')
    expect(SEA_NATIVE_SKIA_ADDON_KEY).toBe('natives/skia.node')
    expect(SEA_NATIVE_SKIA_ICU_KEY).toBe('natives/icudtl.dat')
    expect(SEA_NATIVE_META_LIBVIPS_VERSIONS_KEY).toBe('natives-meta/libvips-versions.json')
    expect(SEA_NATIVE_META_LIBVIPS_PACKAGE_KEY).toBe('natives-meta/libvips-package.json')
    expect(SEA_NATIVE_META_SHARP_PACKAGE_KEY).toBe('natives-meta/sharp-platform-package.json')
    expect(SEA_NATIVE_META_SHARP_VERSIONS_KEY).toBe('natives-meta/sharp-platform-versions.json')
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
    // A local definition would fork the contract.
    expect(source).not.toMatch(/(?:export\s+)?const\s+SEA_MANIFEST_KEY\s*=/)
    expect(source).not.toMatch(/(?:export\s+)?const\s+SEA_SMOKE_WORKER_BUNDLE_KEY\s*=/)
    expect(source).not.toMatch(/(?:export\s+)?const\s+NATIVE_ASSET_PREFIX\s*=/)
    // Importing from the shared module makes equality by construction.
    expect(source).toMatch(/import\s*\{[^}]*SEA_MANIFEST_KEY[^}]*\}\s*from\s*'@\/shared\/sea\/assets'/)
  })

  it('pins the asset codec union in the shared module', () => {
    const source = readSource(SHARED_MODULE)
    // Adding a codec means touching writer + reader: a deliberate change.
    expect(source).toMatch(/export type SeaAssetCodec = 'zstd' \| 'brotli' \| 'none'/)
  })

  it('writer and readers source the asset codec from the shared module', () => {
    for (const file of ['scripts/sea/assets.ts', 'src/server/infra/sea.ts', 'src/server/infra/sea-natives.ts']) {
      const source = readSource(file)
      expect(source, `${file} must reference SeaAssetCodec`).toContain('SeaAssetCodec')
      expect(source, `${file} must import SeaAssetCodec from the shared SEA assets module`).toMatch(
        /import\s*\{[^}]*type SeaAssetCodec[^}]*\}\s*from\s*'(?:@\/shared\/sea\/assets|\.\.\/\.\.\/src\/shared\/sea\/assets\.ts)'/,
      )
    }
  })
})
