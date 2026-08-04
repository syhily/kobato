// SEA (Single Executable Application) runtime helpers.
//
// The production server can be packaged as a Node.js single executable
// (see plans/ and scripts/sea/): the whole server bundle plus every
// runtime resource (client assets, drizzle migrations, wasm, worker code)
// is embedded into the binary as SEA assets and read from memory. Only
// the native dynamic libraries (the sharp and skia addons plus libvips —
// 3 files on darwin/linux, 4 on win32) are extracted to a flat cache
// directory at first run, because the OS `dlopen` requires real files;
// all native package JS is bundled and its platform loads are redirected
// to `nativeRequire` (see `@kobato/server/infra/native-require`).
//
// Every blob asset above 1 KB is stored COMPRESSED (zstd by default,
// brotli for release builds — see `scripts/sea/assets.ts`); the
// uncompressed manifest asset records each file's codec and doubles as
// the decompression registry. `getEmbeddedAsset` decodes lazily: the
// registry is parsed once on the first non-manifest read, and decoded
// bytes are memoized per key (the worker bundle is re-read on every pool
// spawn, static assets on every HTTP request). Asset keys never change —
// compression is fully internal to the blob.
//
// Every function here is a no-op / pass-through outside SEA mode, so the
// dev server, `node apps/core/build/server/index.js`, and vitest behave exactly
// as before:
//   - `isSea()` returns false (the `node:sea` require is guarded because
//     older Node versions may not expose the module at all);
//   - `getEmbeddedAsset` / `listEmbeddedAssetKeys` return null / [];
//   - `requireExternal` resolves from the regular node_modules tree,
//     identical to a static import at runtime.
//
// This module intentionally avoids project imports except the standalone
// `unsafeCast` util, the constants-only `@kobato/shared/sea/assets`, and the
// shared asset reader `@kobato/shared/sea/reader` (itself constants-only +
// `node:zlib`): it is pulled into the image process-worker bundle (see
// `worker-entry-plugin.ts`), which must stay self-contained, and it runs
// inside the SEA bootstrap/CLI modules ahead of the rest of the app graph.

import { createEmbeddedAssetReader } from '@kobato/shared/sea/reader'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

interface NodeSeaModule {
  isSea(): boolean
  getAsset(key: string): ArrayBuffer
  getAssetKeys(): string[]
}

const nodeRequire = createRequire(import.meta.url)

// Lazily resolved + cached. `undefined` = not probed yet; `null` = probed
// and not running as a SEA.
let activeSea: NodeSeaModule | null | undefined

function isNodeSeaModule(value: unknown): value is NodeSeaModule {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return (
    'isSea' in value &&
    typeof value.isSea === 'function' &&
    'getAsset' in value &&
    typeof value.getAsset === 'function' &&
    'getAssetKeys' in value &&
    typeof value.getAssetKeys === 'function'
  )
}

function getSea(): NodeSeaModule | null {
  if (activeSea === undefined) {
    let mod: NodeSeaModule | null = null
    try {
      const required: unknown = nodeRequire('node:sea')
      if (isNodeSeaModule(required)) {
        mod = required
      }
    } catch {
      mod = null
    }
    activeSea = mod !== null && mod.isSea() ? mod : null
  }
  return activeSea
}

/** Whether the current process is a Node.js single executable. */
export function isSea(): boolean {
  return getSea() !== null
}

// Lazily built on first use; the reader memoizes the codec registry and
// the decoded buffers for the process lifetime.
let activeReader: ((key: string) => Buffer | null) | undefined

/**
 * Read an embedded SEA asset by key (e.g. `client/assets/manifest-abc.js`),
 * transparently decompressing it when the manifest packs it with a codec.
 * Returns null when not running as a SEA or when the key is missing.
 */
export function getEmbeddedAsset(key: string): Buffer | null {
  const sea = getSea()
  if (sea === null) {
    return null
  }
  activeReader ??= createEmbeddedAssetReader(sea)
  return activeReader(key)
}

/**
 * List embedded SEA asset keys matching `prefix` (e.g. `client/assets/`).
 * Returns [] when not running as a SEA.
 */
export function listEmbeddedAssetKeys(prefix: string): string[] {
  const sea = getSea()
  if (sea === null) {
    return []
  }
  return sea.getAssetKeys().filter((key) => key.startsWith(prefix))
}

/**
 * Require a module that must resolve against real files on disk. Under
 * SEA this is how `nativeRequire` loads the extracted `.node` addons (by
 * absolute path from the flat natives cache dir); outside SEA it is the
 * regular node_modules resolution the native packages would have done
 * themselves, so `nativeRequire`'s fallback behaves exactly like the
 * un-bundled package.
 *
 * Resolution order:
 *   1. `KOBATO_NATIVES_DIR` (set by `bootstrapSeaRuntime` in SEA mode) —
 *      rooted at the flat `<cache>/natives-<hash>` dir via a `noop.cjs`
 *      anchor (the anchor need not exist: the only specifiers that ever
 *      resolve here under SEA are absolute paths);
 *   2. the regular node_modules tree — identical behavior to a static
 *      import in dev, `node apps/core/build/server/index.js`, and vitest.
 */
export function requireExternal<T>(name: string): T {
  const nativesDir = process.env.KOBATO_NATIVES_DIR
  const mod: unknown =
    nativesDir !== undefined && nativesDir !== ''
      ? createRequire(join(nativesDir, 'noop.cjs'))(name)
      : nodeRequire(name)
  // The CJS require boundary is untyped by nature; the caller supplies T
  // from the package's real type definitions (`typeof import('pkg')`).
  return unsafeCast<T>(mod)
}

/**
 * Base cache directory for runtime-extracted files (the native dynamic
 * libraries). `KOBATO_CACHE_DIR` env > Windows: `%LOCALAPPDATA%\kobato` >
 * `$XDG_CACHE_HOME/kobato` > `~/.cache/kobato`.
 */
export function resolveCacheDir(): string {
  const override = process.env.KOBATO_CACHE_DIR
  if (override !== undefined && override !== '') {
    return override
  }
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA
    return join(
      localAppData !== undefined && localAppData !== '' ? localAppData : join(homedir(), 'AppData', 'Local'),
      'kobato',
    )
  }
  const xdg = process.env.XDG_CACHE_HOME
  if (xdg !== undefined && xdg !== '') {
    return join(xdg, 'kobato')
  }
  return join(homedir(), '.cache', 'kobato')
}
