// SEA runtime helpers. The binary is built with `useVfs`: assets are mounted
// as a read-only virtual file system and the bundle runs from the mount root,
// so raw assets (client/, drizzle/, wasm/, worker/) are plain `node:fs` reads
// via `seaAssetPath`. The zstd-packed natives (and the tiny natives-meta JSONs)
// stay on the `node:sea` getAsset channel — worker threads cannot see the VFS
// mount (their fs calls under it fail with ENOTDIR) but CAN read blob assets.
// No-op / pass-through outside SEA mode. Import budget: node builtins +
// `@/shared/sea/assets` (this module is bundled into the process worker).

import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isMainThread } from 'node:worker_threads'
import { zstdDecompressSync } from 'node:zlib'

import { SEA_MANIFEST_KEY, SEA_NATIVE_ASSET_PREFIX, type SeaAssetCodec } from '@/shared/sea/assets'

interface NodeSeaModule {
  isSea(): boolean
  getAsset(key: string): ArrayBuffer
}

const nodeRequire = createRequire(import.meta.url)

// undefined = not probed yet; null = probed and not a SEA.
let activeSea: NodeSeaModule | null | undefined

function isNodeSeaModule(value: unknown): value is NodeSeaModule {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  return (
    'isSea' in value && typeof value.isSea === 'function' && 'getAsset' in value && typeof value.getAsset === 'function'
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
    activeSea = mod?.isSea() ? mod : null
  }
  return activeSea
}

export function isSea(): boolean {
  return getSea() !== null
}

/**
 * Root of the mounted asset VFS (`useVfs` builds): the injected bundle runs
 * from the mount root, so this module's `import.meta.dirname` IS the root.
 * Main-thread only — worker threads have no view of the mount, and the eval'd
 * worker's `import.meta.dirname` would be a meaningless real-fs path anyway.
 * Null outside SEA.
 */
let vfsRoot: string | null | undefined

export function seaVfsRoot(): string | null {
  if (vfsRoot === undefined) {
    vfsRoot = isMainThread && getSea() !== null ? import.meta.dirname : null
  }
  return vfsRoot
}

/**
 * Absolute VFS path of a raw (unpacked) embedded asset; null outside SEA.
 * Packed `natives/*` keys are rejected — their VFS file holds zstd bytes only
 * the `getEmbeddedAsset` decode path understands.
 */
export function seaAssetPath(key: string): string | null {
  if (key.startsWith(SEA_NATIVE_ASSET_PREFIX)) {
    throw new Error(`seaAssetPath: ${key} is a packed native — read it via getEmbeddedAsset, not the VFS`)
  }
  const root = seaVfsRoot()
  return root === null ? null : join(root, key)
}

/** Minimal asset source a reader needs — the real `node:sea` module in production, a stub in tests. */
export interface EmbeddedAssetSource {
  getAsset(key: string): ArrayBuffer
}

let activeReader: ((key: string) => Buffer | null) | undefined

/**
 * Read an embedded asset through the `node:sea` blob channel, decompressing
 * per the manifest codec; null when not a SEA or when the key is missing.
 * Scoped to the packed `natives/*` payloads and the `natives-meta/*` JSONs —
 * the channel that also works inside worker threads. Raw assets are plain
 * fs reads via `seaAssetPath`.
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
 * Parse the manifest's `key -> codec` registry. A missing codec means an
 * older uncompressed binary (`'none'`); an unparseable manifest means a
 * corrupt binary — fail loudly.
 */
function parseCodecRegistry(manifestRaw: Buffer): Map<string, SeaAssetCodec> {
  let parsed: unknown
  try {
    parsed = JSON.parse(manifestRaw.toString('utf-8'))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid SEA manifest (${SEA_MANIFEST_KEY}): ${reason}`, { cause: error })
  }
  const registry = new Map<string, SeaAssetCodec>()
  if (typeof parsed === 'object' && parsed !== null && 'files' in parsed && Array.isArray(parsed.files)) {
    for (const entry of parsed.files as unknown[]) {
      if (typeof entry !== 'object' || entry === null || !('key' in entry) || !('codec' in entry)) {
        continue
      }
      const { key, codec } = entry
      if (typeof key === 'string' && (codec === 'zstd' || codec === 'none')) {
        registry.set(key, codec)
      }
    }
  }
  return registry
}

/** Build the decoding asset reader bound to an asset source. Exported for tests. */
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
      bytes = zstdDecompressSync(raw)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`SEA embedded asset ${key} failed ${codec} decompression: ${reason}`, { cause: error })
    }
    decodedByKey.set(key, bytes)
    return bytes
  }
}

/**
 * Require a module that must resolve against real files — how `nativeRequire`
 * loads extracted `.node` addons under SEA. Resolution: `KOBATO_NATIVES_DIR`
 * first, then the regular node_modules tree (identical to a static import).
 */
export function requireExternal(name: string): unknown {
  const nativesDir = process.env.KOBATO_NATIVES_DIR
  // CJS require is untyped; the caller casts to the package's real types.
  return nativesDir !== undefined && nativesDir !== ''
    ? createRequire(join(nativesDir, 'noop.cjs'))(name)
    : nodeRequire(name)
}

/**
 * Base cache dir for runtime-extracted files: `KOBATO_CACHE_DIR` >
 * `%LOCALAPPDATA%\kobato` (win32) > `$XDG_CACHE_HOME/kobato` > `~/.cache/kobato`.
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
