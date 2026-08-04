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
} from '@kobato/shared/sea/assets'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Contract test for the SEA embedded-asset keys. `packages/shared/src/sea/assets.ts`
// is the single owner of the key contract: the writer
// (`scripts/sea/assets.ts`) and every runtime reader under `packages/server/src/`
// must source their keys from it. A hardcoded key anywhere else only
// surfaces at `sea:smoke` time — these assertions catch the drift in the
// unit suite instead. No blob is built; this is source-level wiring plus
// value pinning.

const SHARED_MODULE = 'packages/shared/src/sea/assets.ts'

/** Every module that writes or reads embedded assets, with the constants it must import. */
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
    // The decode reader's only asset-key consumer: it sources
    // `SEA_MANIFEST_KEY` from the shared module. The server's `infra/sea.ts`
    // and the frontend's `sea-assets.ts` only probe `node:sea` and hand the
    // module to `createEmbeddedAssetReader` — no keys of their own.
    file: 'packages/shared/src/sea/reader.ts',
    names: ['SEA_MANIFEST_KEY'],
    forbiddenLiterals: [`'manifest.json'`],
  },
  {
    file: 'packages/server/src/infra/sea-natives.ts',
    names: ['SEA_MANIFEST_KEY', 'SEA_NATIVE_ASSET_PREFIX'],
    forbiddenLiterals: [`'manifest.json'`, `'natives/'`],
  },
  {
    file: 'packages/server/src/infra/sea-cli.ts',
    names: ['SEA_SMOKE_WORKER_BUNDLE_KEY'],
    forbiddenLiterals: [`'worker/smoke-worker.mjs'`],
  },
  {
    file: 'packages/server/src/infra/native-require.ts',
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
    file: 'packages/server/src/infra/image/process-pool.ts',
    names: ['SEA_PROCESS_WORKER_BUNDLE_KEY'],
    forbiddenLiterals: [`'worker/process-worker.mjs'`],
  },
  {
    file: 'packages/server/src/render/warmup/manifest.ts',
    names: ['SEA_CLIENT_ASSET_PREFIX'],
    forbiddenLiterals: [`'client/assets/warmup-manifest.json'`, `'client/assets/manifest-'`],
  },
  {
    file: 'packages/server/src/domains/fonts/vendor/wasm-split.ts',
    names: ['SEA_WASM_CNFS_KEY'],
    forbiddenLiterals: [`'wasm/cnfs.wasm'`],
  },
  {
    file: 'packages/server/src/infra/db/migrate.ts',
    names: ['SEA_DRIZZLE_ASSET_PREFIX'],
    forbiddenLiterals: [`'drizzle/'`],
  },
  {
    file: 'packages/server/src/infra/hono/node.ts',
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
      // The writer imports relatively (`packages/shared/src/sea/assets.ts`),
      // the runtime readers through the `@kobato/shared/sea/assets` alias —
      // both must point at the shared module.
      expect(source, `${file} must import from the shared SEA assets module`).toMatch(
        /(?:@kobato\/shared\/sea\/assets|packages\/shared\/src\/sea\/assets\.ts)/,
      )
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
    const source = readSource('packages/server/src/infra/sea-natives.ts')
    // The constants must come from the shared module — a local definition
    // would fork the contract (the pre-shared-module bug shape).
    expect(source).not.toMatch(/(?:export\s+)?const\s+SEA_MANIFEST_KEY\s*=/)
    expect(source).not.toMatch(/(?:export\s+)?const\s+SEA_SMOKE_WORKER_BUNDLE_KEY\s*=/)
    expect(source).not.toMatch(/(?:export\s+)?const\s+NATIVE_ASSET_PREFIX\s*=/)
    // And the values it uses are exactly the shared ones: importing the
    // names above from the shared module makes equality by construction.
    expect(source).toMatch(/import\s*\{[^}]*SEA_MANIFEST_KEY[^}]*\}\s*from\s*'@kobato\/shared\/sea\/assets'/)
  })

  it('pins the asset codec union in the shared module', () => {
    const source = readSource(SHARED_MODULE)
    // The manifest `codec` field has exactly three values; adding one means
    // touching writer + reader, which this pins as a deliberate change.
    expect(source).toMatch(/export type SeaAssetCodec = 'zstd' \| 'brotli' \| 'none'/)
  })

  it('writer and readers source the asset codec from the shared module', () => {
    for (const file of [
      'scripts/sea/assets.ts',
      'packages/shared/src/sea/reader.ts',
      'packages/server/src/infra/sea-natives.ts',
    ]) {
      const source = readSource(file)
      expect(source, `${file} must reference SeaAssetCodec`).toContain('SeaAssetCodec')
      // `scripts/sea/assets.ts` runs under plain `node` (no tsconfig path
      // aliases) and therefore imports the shared module RELATIVELY —
      // the same tolerance the pre-split contract had; the readers use
      // the `@kobato/shared/sea/assets` package specifier.
      expect(source, `${file} must import SeaAssetCodec from the shared SEA assets module`).toMatch(
        /import\s*\{[^}]*type SeaAssetCodec[^}]*\}\s*from\s*'(?:@kobato\/shared\/sea\/assets|\.\.\/\.\.\/packages\/shared\/src\/sea\/assets\.ts)'/,
      )
    }
  })
})
