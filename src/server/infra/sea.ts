// SEA runtime helpers — embedded assets read from memory, natives extracted
// to disk. No-op / pass-through outside SEA mode. Import budget: only
// `unsafeCast` + `@/shared/sea/assets` (bundled into the process worker).

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

// undefined = not probed yet; null = probed and not a SEA.
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

export function isSea(): boolean {
  return getSea() !== null
}

/** Minimal asset source a reader needs — the real `node:sea` module in production, a stub in tests. */
export interface EmbeddedAssetSource {
  getAsset(key: string): ArrayBuffer
}

let activeReader: ((key: string) => Buffer | null) | undefined

/**
 * Read an embedded SEA asset by key, decompressing per the manifest codec;
 * null when not a SEA or when the key is missing.
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
      if (typeof key === 'string' && (codec === 'zstd' || codec === 'brotli' || codec === 'none')) {
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
      bytes = codec === 'zstd' ? zstdDecompressSync(raw) : brotliDecompressSync(raw)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`SEA embedded asset ${key} failed ${codec} decompression: ${reason}`, { cause: error })
    }
    decodedByKey.set(key, bytes)
    return bytes
  }
}

/** List embedded SEA asset keys matching `prefix`; [] when not a SEA. */
export function listEmbeddedAssetKeys(prefix: string): string[] {
  const sea = getSea()
  if (sea === null) {
    return []
  }
  return sea.getAssetKeys().filter((key) => key.startsWith(prefix))
}

/**
 * Require a module that must resolve against real files — how `nativeRequire`
 * loads extracted `.node` addons under SEA. Resolution: `KOBATO_NATIVES_DIR`
 * first, then the regular node_modules tree (identical to a static import).
 */
export function requireExternal<T>(name: string): T {
  const nativesDir = process.env.KOBATO_NATIVES_DIR
  const mod: unknown =
    nativesDir !== undefined && nativesDir !== ''
      ? createRequire(join(nativesDir, 'noop.cjs'))(name)
      : nodeRequire(name)
  // CJS require is untyped; the caller supplies T from the package's real types.
  return unsafeCast<T>(mod)
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
