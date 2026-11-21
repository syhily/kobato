import { SEA_MANIFEST_KEY, SEA_NATIVE_ASSET_PREFIX, type SeaAssetCodec } from '@kobato/distribution/sea-assets'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { isMainThread } from 'node:worker_threads'
import { zstdDecompressSync } from 'node:zlib'

interface NodeSeaModule {
  isSea(): boolean
  getAsset(key: string): ArrayBuffer
}

const nodeRequire = createRequire(import.meta.url)

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

let vfsRoot: string | null | undefined

export function seaVfsRoot(): string | null {
  if (vfsRoot === undefined) {
    vfsRoot = isMainThread && getSea() !== null ? import.meta.dirname : null
  }
  return vfsRoot
}

export function seaAssetPath(key: string): string | null {
  if (key.startsWith(SEA_NATIVE_ASSET_PREFIX)) {
    throw new Error(`seaAssetPath: ${key} is a packed native — read it via getEmbeddedAsset, not the VFS`)
  }
  const root = seaVfsRoot()
  return root === null ? null : join(root, key)
}

export interface EmbeddedAssetSource {
  getAsset(key: string): ArrayBuffer
}

let activeReader: ((key: string) => Buffer | null) | undefined

export function getEmbeddedAsset(key: string): Buffer | null {
  const sea = getSea()
  if (sea === null) {
    return null
  }
  activeReader ??= createEmbeddedAssetReader(sea)
  return activeReader(key)
}

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

export function requireExternal(name: string): unknown {
  const nativesDir = process.env.KOBATO_NATIVES_DIR
  return nativesDir !== undefined && nativesDir !== ''
    ? createRequire(join(nativesDir, 'noop.cjs'))(name)
    : nodeRequire(name)
}

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
