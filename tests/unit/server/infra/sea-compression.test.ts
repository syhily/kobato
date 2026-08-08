import { createHash } from 'node:crypto'
import { brotliDecompressSync, zstdDecompressSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

import { createEmbeddedAssetReader, type EmbeddedAssetSource } from '@/server/infra/sea'
import { SEA_MANIFEST_KEY, type SeaAssetCodec } from '@/shared/sea/assets'

import {
  isDrizzleSnapshotArtifact,
  packAssetBytes,
  SEA_COMPRESSION_MIN_BYTES,
  sortManifestFiles,
} from '../../../../scripts/sea/assets.ts'

// SEA blob compression contract: the writer and reader must agree on the
// packed format, with the manifest asset riding uncompressed as the
// decompression registry. The reader runs against a stub node:sea source (see sea.test.ts).

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Deterministic non-trivial bytes (compressible, but not a single run). */
function sampleBytes(length: number): Buffer {
  return Buffer.from(Array.from({ length }, (_, index) => (index * 31 + (index % 7) * 61) % 256))
}

interface ManifestEntryShape {
  key: string
  codec?: SeaAssetCodec
  size?: number
}

/** Manifest bytes in the exact writer shape: entries sorted by key,
 *  `{ key, path, sha256, codec, size }`, 2-space JSON + trailing newline
 *  (the natives cache dir is named after the sha256 of these bytes);
 *  `codec`/`size` optional to emulate pre-compression binaries. */
function manifestAsset(entries: ManifestEntryShape[], rawByKey: Record<string, Buffer>): Buffer {
  const files = sortManifestFiles(
    entries.map((entry) => {
      const file: { key: string; path: string; sha256: string; codec?: SeaAssetCodec; size?: number } = {
        key: entry.key,
        path: entry.key,
        sha256: sha256(rawByKey[entry.key]),
      }
      if (entry.codec !== undefined) {
        file.codec = entry.codec
      }
      if (entry.size !== undefined) {
        file.size = entry.size
      }
      return file
    }),
  )
  const manifest = { version: '0.0.0-test', target: 'test-target', files }
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
}

/** Stub `node:sea`-shaped asset source that counts reads per key. */
function makeSource(assets: Map<string, Buffer>) {
  const reads = new Map<string, number>()
  const source: EmbeddedAssetSource = {
    getAsset(key: string): ArrayBuffer {
      reads.set(key, (reads.get(key) ?? 0) + 1)
      const bytes = assets.get(key)
      if (bytes === undefined) {
        throw new Error(`no such embedded asset: ${key}`)
      }
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    },
  }
  return { source, reads }
}

/** Packs entries through the real writer and assembles the blob assets
 *  (packed payloads + uncompressed manifest) like `collectSeaAssets`. */
function buildBlob(rawByKey: Record<string, Buffer>, codec: 'zstd' | 'brotli') {
  const assets = new Map<string, Buffer>()
  const entries = Object.keys(rawByKey).map((key) => {
    const packed = packAssetBytes(rawByKey[key], codec)
    assets.set(key, packed.bytes)
    return { key, codec: packed.codec, size: rawByKey[key].byteLength }
  })
  assets.set(SEA_MANIFEST_KEY, manifestAsset(entries, rawByKey))
  return assets
}

describe('sea-compression — writer packAssetBytes', () => {
  it('compresses above-threshold assets with zstd and round-trips', () => {
    const raw = sampleBytes(64 * 1024)
    const packed = packAssetBytes(raw, 'zstd')
    expect(packed.codec).toBe('zstd')
    expect(packed.bytes.byteLength).toBeLessThan(raw.byteLength)
    expect(zstdDecompressSync(packed.bytes).equals(raw)).toBe(true)
  })

  it('compresses with brotli quality 11 when requested and round-trips', () => {
    const raw = sampleBytes(64 * 1024)
    const packed = packAssetBytes(raw, 'brotli')
    expect(packed.codec).toBe('brotli')
    expect(brotliDecompressSync(packed.bytes).equals(raw)).toBe(true)
  })

  it('keeps below-threshold assets raw', () => {
    const raw = sampleBytes(SEA_COMPRESSION_MIN_BYTES - 1)
    const packed = packAssetBytes(raw, 'zstd')
    expect(packed.codec).toBe('none')
    expect(packed.bytes).toBe(raw)
  })

  it('compresses assets at exactly the threshold', () => {
    const packed = packAssetBytes(sampleBytes(SEA_COMPRESSION_MIN_BYTES), 'zstd')
    expect(packed.codec).toBe('zstd')
  })

  it('packs deterministically — same input, same bytes', () => {
    const raw = sampleBytes(8 * 1024)
    expect(packAssetBytes(raw, 'zstd').bytes.equals(packAssetBytes(raw, 'zstd').bytes)).toBe(true)
    expect(packAssetBytes(raw, 'brotli').bytes.equals(packAssetBytes(raw, 'brotli').bytes)).toBe(true)
  })
})

describe('sea-compression — manifest schema and determinism', () => {
  it('sorts manifest files by plain ASCII key order', () => {
    const sorted = sortManifestFiles([{ key: 'drizzle/x' }, { key: 'client/b.js' }, { key: 'client/a.js' }])
    expect(sorted.map((entry) => entry.key)).toEqual(['client/a.js', 'client/b.js', 'drizzle/x'])
  })

  it('serializes the same manifest to identical bytes regardless of input order', () => {
    const rawByKey = { 'client/a.js': sampleBytes(2048), 'client/b.js': sampleBytes(4096) }
    const first = manifestAsset(
      [
        { key: 'client/a.js', codec: 'zstd', size: 2048 },
        { key: 'client/b.js', codec: 'zstd', size: 4096 },
      ],
      rawByKey,
    )
    const second = manifestAsset(
      [
        { key: 'client/b.js', codec: 'zstd', size: 4096 },
        { key: 'client/a.js', codec: 'zstd', size: 2048 },
      ],
      rawByKey,
    )
    expect(first.equals(second)).toBe(true)
  })

  it('emits codec and size per file in the writer shape', () => {
    const rawByKey = { 'client/a.js': sampleBytes(2048) }
    const manifest = JSON.parse(manifestAsset([{ key: 'client/a.js', codec: 'zstd', size: 2048 }], rawByKey).toString())
    expect(manifest.files).toEqual([
      { key: 'client/a.js', path: 'client/a.js', sha256: sha256(rawByKey['client/a.js']), codec: 'zstd', size: 2048 },
    ])
  })
})

describe('sea-compression — reader createEmbeddedAssetReader', () => {
  it('round-trips every codec through the real writer and reader', () => {
    const rawByKey = {
      'client/assets/app.js': sampleBytes(128 * 1024),
      'client/favicon.svg': sampleBytes(128), // below the threshold: 'none'
      'drizzle/0001_init/migration.sql': sampleBytes(8 * 1024),
    }
    for (const codec of ['zstd', 'brotli'] as const) {
      const { source } = makeSource(buildBlob(rawByKey, codec))
      const read = createEmbeddedAssetReader(source)
      for (const [key, raw] of Object.entries(rawByKey)) {
        expect(read(key)?.equals(raw), `${codec} round-trip of ${key}`).toBe(true)
      }
    }
  })

  it('returns the manifest asset raw — it is the registry and rides uncompressed', () => {
    const assets = buildBlob({ 'client/assets/app.js': sampleBytes(2048) }, 'zstd')
    const { source } = makeSource(assets)
    const read = createEmbeddedAssetReader(source)
    expect(read(SEA_MANIFEST_KEY)?.equals(assets.get(SEA_MANIFEST_KEY)!)).toBe(true)
  })

  it('treats a manifest without codec fields (older binaries) as uncompressed', () => {
    const rawByKey = { 'client/assets/app.js': sampleBytes(4096) }
    const assets = new Map<string, Buffer>([
      ['client/assets/app.js', rawByKey['client/assets/app.js']],
      [SEA_MANIFEST_KEY, manifestAsset([{ key: 'client/assets/app.js' }], rawByKey)],
    ])
    const { source } = makeSource(assets)
    const read = createEmbeddedAssetReader(source)
    expect(read('client/assets/app.js')?.equals(rawByKey['client/assets/app.js'])).toBe(true)
  })

  it('returns null for unknown keys', () => {
    const { source } = makeSource(buildBlob({ 'client/assets/app.js': sampleBytes(2048) }, 'zstd'))
    const read = createEmbeddedAssetReader(source)
    expect(read('client/assets/missing.js')).toBeNull()
  })

  it('memoizes decoded bytes and loads the manifest only once', () => {
    const rawByKey = {
      'client/assets/app.js': sampleBytes(16 * 1024),
      'client/assets/vendor.js': sampleBytes(32 * 1024),
    }
    const { source, reads } = makeSource(buildBlob(rawByKey, 'zstd'))
    const read = createEmbeddedAssetReader(source)

    read('client/assets/app.js')
    read('client/assets/app.js')
    read('client/assets/vendor.js')

    expect(reads.get('client/assets/app.js')).toBe(1)
    expect(reads.get(SEA_MANIFEST_KEY)).toBe(1)
    // The second key hits the memoized registry; its own payload decodes once.
    expect(reads.get('client/assets/vendor.js')).toBe(1)
  })

  it('throws a clear error naming the key on corrupt compressed bytes', () => {
    const raw = sampleBytes(16 * 1024)
    const assets = buildBlob({ 'client/assets/app.js': raw }, 'zstd')
    const corrupted = Buffer.from(assets.get('client/assets/app.js')!)
    corrupted[0] ^= 0xff // destroy the zstd frame magic
    assets.set('client/assets/app.js', corrupted)

    const { source } = makeSource(assets)
    const read = createEmbeddedAssetReader(source)
    expect(() => read('client/assets/app.js')).toThrow(/client\/assets\/app\.js.*zstd/)
  })

  it('throws a clear error when the manifest asset is missing', () => {
    const assets = buildBlob({ 'client/assets/app.js': sampleBytes(2048) }, 'zstd')
    assets.delete(SEA_MANIFEST_KEY)
    const { source } = makeSource(assets)
    const read = createEmbeddedAssetReader(source)
    expect(() => read('client/assets/app.js')).toThrow(new RegExp(SEA_MANIFEST_KEY.replace('.', '\\.')))
  })
})

describe('scripts/sea/assets — isDrizzleSnapshotArtifact', () => {
  it('excludes drizzle-kit snapshot artifacts in both layouts', () => {
    expect(isDrizzleSnapshotArtifact('20260514000001_init_schema/snapshot.json')).toBe(true)
    expect(isDrizzleSnapshotArtifact('snapshot.json')).toBe(true)
    expect(isDrizzleSnapshotArtifact('20260514000001_init_schema/snapshot/0000_snapshot.json')).toBe(true)
  })

  it('keeps migration.sql and any non-snapshot file', () => {
    expect(isDrizzleSnapshotArtifact('20260514000001_init_schema/migration.sql')).toBe(false)
    expect(isDrizzleSnapshotArtifact('20260514000001_init_schema/notes.md')).toBe(false)
  })
})
