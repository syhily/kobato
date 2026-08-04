// Single owner of the SEA (Single Executable Application) embedded-asset
// decoding reader: build a memoized, decompressing asset reader bound to
// an asset source. The environment probes live with each runtime — the
// `node:sea` module resolution in `@kobato/server/infra/sea` and
// `apps/public/src/lib/sea-assets` — this module only owns the codec
// registry parse + lazy decode, so the reader contract cannot drift
// between the core binary and the frontend binary.
//
// Every blob asset above 1 KB is stored COMPRESSED (zstd by default,
// brotli for release builds — see `scripts/sea/assets.ts`); the
// uncompressed manifest asset records each file's codec and doubles as
// the decompression registry. The reader decodes lazily: the registry is
// parsed once on the first non-manifest read, and decoded bytes are
// memoized per key (the worker bundle is re-read on every pool spawn,
// static assets on every HTTP request).
//
// Server-only module: `node:zlib` — never imported by browser bundles.

import { SEA_MANIFEST_KEY, type SeaAssetCodec } from '@kobato/shared/sea/assets'
import { brotliDecompressSync, zstdDecompressSync } from 'node:zlib'

/** Minimal asset source a reader needs — the real `node:sea` module in production, a stub in tests. */
export interface EmbeddedAssetSource {
  getAsset(key: string): ArrayBuffer
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
 * tests; production code enters through each runtime's own
 * `getEmbeddedAsset` wrapper.
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
