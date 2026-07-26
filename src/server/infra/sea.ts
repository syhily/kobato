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
// to `nativeRequire` (see `@/server/infra/native-require`).
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
// dev server, `node ./build/server/index.js`, and vitest behave exactly
// as before:
//   - `isSea()` returns false (the `node:sea` require is guarded because
//     older Node versions may not expose the module at all);
//   - `getEmbeddedAsset` / `listEmbeddedAssetKeys` return null / [];
//   - `requireExternal` resolves from the regular node_modules tree,
//     identical to a static import at runtime.
//
// This module intentionally avoids project imports except the standalone
// `unsafeCast` util and the constants-only `@/shared/sea/assets`: it is
// pulled into the image process-worker bundle (see
// `worker-entry-plugin.ts`), which must stay self-contained, and it runs
// inside the SEA bootstrap/CLI modules ahead of the rest of the app graph.

import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { brotliDecompressSync, zstdDecompressSync } from 'node:zlib'

import { SEA_MANIFEST_KEY, type SeaAssetCodec } from '@/shared/sea/assets'
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

/** Minimal asset source a reader needs — the real `node:sea` module in production, a stub in tests. */
export interface EmbeddedAssetSource {
  getAsset(key: string): ArrayBuffer
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
 * Parse the manifest's `key -> codec` registry. Missing/invalid entries
 * are skipped: a missing codec field means an older (uncompressed)
 * binary, correctly read as `'none'`. An unparseable manifest means a
 * corrupt binary — fail loudly instead of serving garbage bytes.
 */
function parseCodecRegistry(manifestRaw: Buffer): Map<string, SeaAssetCodec> {
  let parsed: unknown
  try {
    parsed = JSON.parse(manifestRaw.toString('utf-8'))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid SEA manifest (${SEA_MANIFEST_KEY}): ${reason}`)
  }
  const registry = new Map<string, SeaAssetCodec>()
  if (typeof parsed === 'object' && parsed !== null && 'files' in parsed && Array.isArray(parsed.files)) {
    for (const entry of parsed.files as unknown[]) {
      if (typeof entry !== 'object' || entry === null || !('key' in entry) || !('codec' in entry)) {
        continue
      }
      const { key, codec } = entry
      if (typeof key === 'string' && (codec === 'zstd' || codec === 'brotli' || codec === 'none')) {
        registry.set(key, codec)
      }
    }
  }
  return registry
}

/**
 * Build the decoding asset reader bound to an asset source. Exported for
 * tests; production code enters through `getEmbeddedAsset`.
 */
export function createEmbeddedAssetReader(source: EmbeddedAssetSource): (key: string) => Buffer | null {
  let codecRegistry: Map<string, SeaAssetCodec> | undefined
  const decodedByKey = new Map<string, Buffer>()

  function readRaw(key: string): Buffer | null {
    try {
      return Buffer.from(source.getAsset(key))
    } catch {
      return null
    }
  }

  function codecOf(key: string): SeaAssetCodec {
    if (codecRegistry === undefined) {
      const manifestRaw = readRaw(SEA_MANIFEST_KEY)
      if (manifestRaw === null) {
        throw new Error(`SEA manifest asset missing: ${SEA_MANIFEST_KEY} (cannot decode embedded assets)`)
      }
      codecRegistry = parseCodecRegistry(manifestRaw)
    }
    return codecRegistry.get(key) ?? 'none'
  }

  return (key) => {
    const cached = decodedByKey.get(key)
    if (cached !== undefined) {
      return cached
    }
    const raw = readRaw(key)
    if (raw === null) {
      return null
    }
    // The manifest rides uncompressed — it is the decompression registry
    // and must be readable before anything else.
    if (key === SEA_MANIFEST_KEY) {
      return raw
    }
    const codec = codecOf(key)
    if (codec === 'none') {
      return raw
    }
    let bytes: Buffer
    try {
      bytes = codec === 'zstd' ? zstdDecompressSync(raw) : brotliDecompressSync(raw)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`SEA embedded asset ${key} failed ${codec} decompression: ${reason}`)
    }
    decodedByKey.set(key, bytes)
    return bytes
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
