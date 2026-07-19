// SEA (Single Executable Application) runtime helpers.
//
// The production server can be packaged as a Node.js single executable
// (see plans/ and scripts/sea/): the whole server bundle plus every
// runtime resource (client assets, drizzle migrations, wasm, worker code)
// is embedded into the binary as SEA assets and read from memory. Only
// native packages (sharp, sharp-ico, @napi-rs/canvas and their platform
// packages) are extracted to a cache directory at first run, because the
// OS `dlopen` requires real files.
//
// Every function here is a no-op / pass-through outside SEA mode, so the
// dev server, `node ./build/server/index.js`, and vitest behave exactly
// as before:
//   - `isSea()` returns false (the `node:sea` require is guarded because
//     older Node versions may not expose the module at all);
//   - `getEmbeddedAsset` / `listEmbeddedAssetKeys` return null / [];
//   - `requireExternal` resolves from the regular node_modules tree,
//     identical to today's static imports at runtime.
//
// This module intentionally avoids project imports except the standalone
// `unsafeCast` util: it is pulled into the image process-worker bundle
// (see `worker-entry-plugin.ts`), which must stay self-contained, and it
// runs inside the SEA prelude before the rest of the app graph is
// available.

import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { unsafeCast } from '@/shared/utils/unsafe-cast'

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

/**
 * Read an embedded SEA asset by key (e.g. `client/assets/manifest-abc.js`).
 * Returns null when not running as a SEA or when the key is missing.
 */
export function getEmbeddedAsset(key: string): Buffer | null {
  const sea = getSea()
  if (sea === null) {
    return null
  }
  try {
    return Buffer.from(sea.getAsset(key))
  } catch {
    return null
  }
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
 * Require a package that must resolve against real files on disk — i.e.
 * the native packages extracted by `bootstrapSeaRuntime` (sharp,
 * sharp-ico, @napi-rs/canvas). Static `import` of these packages is
 * banned project-wide: under SEA the restricted `require` cannot resolve
 * bare specifiers, so every consumer goes through this helper.
 *
 * Resolution order:
 *   1. `KOBATO_NATIVES_DIR` (set by `bootstrapSeaRuntime` in SEA mode) —
 *      rooted at the extracted `<cache>/natives-<hash>/node_modules` tree
 *      via the `noop.cjs` shim written next to it;
 *   2. the regular node_modules tree — identical behavior to a static
 *      import in dev, `node ./build/server/index.js`, and vitest.
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
 * Base cache directory for runtime-extracted files (native packages).
 * `KOBATO_CACHE_DIR` env > `$XDG_CACHE_HOME/kobato` > `~/.cache/kobato`.
 */
export function resolveCacheDir(): string {
  const override = process.env.KOBATO_CACHE_DIR
  if (override !== undefined && override !== '') {
    return override
  }
  const xdg = process.env.XDG_CACHE_HOME
  if (xdg !== undefined && xdg !== '') {
    return join(xdg, 'kobato')
  }
  return join(homedir(), '.cache', 'kobato')
}
