import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { bootstrapSeaRuntime, extractNatives, type SeaManifest } from '@/server/infra/sea-natives'

// Unit tests for the SEA natives extractor. `bootstrapSeaRuntime` is a
// no-op outside SEA mode, so the extraction core (`extractNatives`) is
// exercised directly with a fake embedded-asset source and a temp cache
// dir: first-run extraction into the FLAT layout (`natives/` prefix
// stripped), reuse on the second run, repair of a corrupted file, and GC
// of stale hash dirs.

const CURRENT_TARGET = `${process.platform}-${process.arch}`

const tmpDirs: string[] = []

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kobato-sea-natives-test-'))
  tmpDirs.push(dir)
  return dir
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

const silentLogger = { info: vi.fn(), debug: vi.fn() }

function buildEmbedded(files: Record<string, string>, target: string = CURRENT_TARGET) {
  const manifest: SeaManifest = {
    version: '0.0.0-test',
    target,
    files: Object.entries(files).map(([key, content]) => ({ key, path: key, sha256: sha256(content) })),
  }
  const assets = new Map(Object.entries(files).map(([key, content]) => [key, Buffer.from(content, 'utf-8')]))
  return {
    manifestRaw: Buffer.from(JSON.stringify(manifest), 'utf-8'),
    getAsset: (key: string) => assets.get(key) ?? null,
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  while (tmpDirs.length > 0) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true })
  }
})

describe('infra/sea-natives — extractNatives', () => {
  it('extracts only natives/ assets, into a flat dir', () => {
    const cacheDir = makeTmpDir()
    const { manifestRaw, getAsset } = buildEmbedded({
      'natives/sharp.node': 'fake-sharp-addon',
      'natives/libvips-cpp.8.18.3.dylib': 'fake-libvips',
      'natives/skia.node': 'fake-skia-addon',
      'natives-meta/libvips-versions.json': '{"vips":"8.18.3"}',
      'client/assets/app.js': 'stays-in-the-blob',
    })

    const result = extractNatives({ manifestRaw, cacheDir, getAsset, logger: silentLogger })

    expect(result.extracted).toBe(3)
    expect(result.reused).toBe(0)
    expect(result.nativesDir).toBe(result.dir)
    // Flat: the `natives/` prefix is stripped, no subdirectories.
    expect(readFileSync(join(result.dir, 'sharp.node'), 'utf-8')).toBe('fake-sharp-addon')
    expect(readFileSync(join(result.dir, 'libvips-cpp.8.18.3.dylib'), 'utf-8')).toBe('fake-libvips')
    expect(readFileSync(join(result.dir, 'skia.node'), 'utf-8')).toBe('fake-skia-addon')
    // Everything else — metadata JSON included — is never written to disk.
    expect(existsSync(join(result.dir, 'natives'))).toBe(false)
    expect(existsSync(join(result.dir, 'natives-meta'))).toBe(false)
    expect(existsSync(join(result.dir, 'client/assets/app.js'))).toBe(false)
    // The cache dir name carries the manifest hash prefix.
    expect(result.dir).toBe(join(cacheDir, `natives-${sha256(manifestRaw).slice(0, 16)}`))
  })

  it('reuses unchanged files on a second run', () => {
    const cacheDir = makeTmpDir()
    const embedded = buildEmbedded({
      'natives/sharp.node': 'fake-sharp-addon',
      'natives/libvips-cpp.8.18.3.dylib': 'fake-libvips',
      'natives/skia.node': 'fake-skia-addon',
    })

    extractNatives({ manifestRaw: embedded.manifestRaw, cacheDir, getAsset: embedded.getAsset, logger: silentLogger })
    const second = extractNatives({
      manifestRaw: embedded.manifestRaw,
      cacheDir,
      getAsset: embedded.getAsset,
      logger: silentLogger,
    })

    expect(second.extracted).toBe(0)
    expect(second.reused).toBe(3)
  })

  it('repairs a corrupted file instead of trusting it', () => {
    const cacheDir = makeTmpDir()
    const embedded = buildEmbedded({ 'natives/sharp.node': 'fake-sharp-addon' })

    const first = extractNatives({
      manifestRaw: embedded.manifestRaw,
      cacheDir,
      getAsset: embedded.getAsset,
      logger: silentLogger,
    })
    writeFileSync(join(first.dir, 'sharp.node'), 'tampered')

    const second = extractNatives({
      manifestRaw: embedded.manifestRaw,
      cacheDir,
      getAsset: embedded.getAsset,
      logger: silentLogger,
    })

    expect(second.extracted).toBe(1)
    expect(second.reused).toBe(0)
    expect(readFileSync(join(first.dir, 'sharp.node'), 'utf-8')).toBe('fake-sharp-addon')
  })

  it('removes stale natives-* dirs from previous manifest hashes', () => {
    const cacheDir = makeTmpDir()
    const staleDir = join(cacheDir, 'natives-deadbeefcafe0000')
    mkdirSync(staleDir, { recursive: true })
    writeFileSync(join(staleDir, 'stale.node'), 'old')
    const embedded = buildEmbedded({ 'natives/sharp.node': 'fake-sharp-addon' })

    const result = extractNatives({
      manifestRaw: embedded.manifestRaw,
      cacheDir,
      getAsset: embedded.getAsset,
      logger: silentLogger,
    })

    expect(existsSync(join(cacheDir, 'natives-deadbeefcafe0000'))).toBe(false)
    expect(existsSync(result.dir)).toBe(true)
  })

  it('throws a clear error when the manifest target does not match this machine', () => {
    const cacheDir = makeTmpDir()
    const { manifestRaw, getAsset } = buildEmbedded({ 'natives/sharp.node': 'x' }, 'aix-ppc64')

    expect(() => extractNatives({ manifestRaw, cacheDir, getAsset, logger: silentLogger })).toThrow(
      /target mismatch.*aix-ppc64/,
    )
  })

  it('throws when an embedded asset fails its sha256 check', () => {
    const cacheDir = makeTmpDir()
    const { manifestRaw } = buildEmbedded({ 'natives/sharp.node': 'expected' })
    const corruptedGetAsset = () => Buffer.from('corrupted', 'utf-8')

    expect(() => extractNatives({ manifestRaw, cacheDir, getAsset: corruptedGetAsset, logger: silentLogger })).toThrow(
      /checksum mismatch/,
    )
  })
})

describe('infra/sea-natives — bootstrapSeaRuntime', () => {
  it('is a no-op outside SEA mode', () => {
    const before = process.env.KOBATO_NATIVES_DIR
    expect(() => bootstrapSeaRuntime()).not.toThrow()
    expect(process.env.KOBATO_NATIVES_DIR).toBe(before)
  })
})
