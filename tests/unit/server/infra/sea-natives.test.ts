import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { bootstrapSeaRuntime, extractNatives, type SeaManifest } from '@/server/infra/sea-natives'

// Unit tests for the SEA natives extractor. `bootstrapSeaRuntime` is a
// no-op outside SEA mode, so the extraction core (`extractNatives`) is
// exercised directly with a fake embedded-asset source and a temp cache
// dir: first-run extraction, reuse on the second run, repair of a
// corrupted file, the `noop.cjs` shim, and GC of stale hash dirs.

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
  it('extracts only node_modules/ assets and writes the noop.cjs shim', () => {
    const cacheDir = makeTmpDir()
    const { manifestRaw, getAsset } = buildEmbedded({
      'node_modules/sharp/package.json': '{"name":"sharp"}',
      'node_modules/sharp/lib/sharp.node': 'fake-native-bytes',
      'client/assets/app.js': 'stays-in-the-blob',
    })

    const result = extractNatives({ manifestRaw, cacheDir, getAsset, logger: silentLogger })

    expect(result.extracted).toBe(2)
    expect(result.reused).toBe(0)
    expect(result.nativesDir).toBe(join(result.dir, 'node_modules'))
    expect(readFileSync(join(result.dir, 'node_modules/sharp/lib/sharp.node'), 'utf-8')).toBe('fake-native-bytes')
    expect(readFileSync(join(result.dir, 'node_modules/sharp/package.json'), 'utf-8')).toBe('{"name":"sharp"}')
    // Non-native assets are never written to disk.
    expect(existsSync(join(result.dir, 'client/assets/app.js'))).toBe(false)
    // The createRequire shim exists next to the extracted packages.
    expect(readFileSync(join(result.nativesDir, 'noop.cjs'), 'utf-8')).toBe('module.exports = require\n')
    // The cache dir name carries the manifest hash prefix.
    expect(result.dir).toBe(join(cacheDir, `natives-${sha256(manifestRaw).slice(0, 16)}`))
  })

  it('reuses unchanged files on a second run', () => {
    const cacheDir = makeTmpDir()
    const embedded = buildEmbedded({ 'node_modules/sharp/lib/sharp.node': 'fake-native-bytes' })

    extractNatives({ manifestRaw: embedded.manifestRaw, cacheDir, getAsset: embedded.getAsset, logger: silentLogger })
    const second = extractNatives({
      manifestRaw: embedded.manifestRaw,
      cacheDir,
      getAsset: embedded.getAsset,
      logger: silentLogger,
    })

    expect(second.extracted).toBe(0)
    expect(second.reused).toBe(1)
  })

  it('repairs a corrupted file instead of trusting it', () => {
    const cacheDir = makeTmpDir()
    const embedded = buildEmbedded({ 'node_modules/sharp/lib/sharp.node': 'fake-native-bytes' })

    const first = extractNatives({
      manifestRaw: embedded.manifestRaw,
      cacheDir,
      getAsset: embedded.getAsset,
      logger: silentLogger,
    })
    writeFileSync(join(first.dir, 'node_modules/sharp/lib/sharp.node'), 'tampered')

    const second = extractNatives({
      manifestRaw: embedded.manifestRaw,
      cacheDir,
      getAsset: embedded.getAsset,
      logger: silentLogger,
    })

    expect(second.extracted).toBe(1)
    expect(second.reused).toBe(0)
    expect(readFileSync(join(first.dir, 'node_modules/sharp/lib/sharp.node'), 'utf-8')).toBe('fake-native-bytes')
  })

  it('removes stale natives-* dirs from previous manifest hashes', () => {
    const cacheDir = makeTmpDir()
    const staleDir = join(cacheDir, 'natives-deadbeefcafe0000', 'node_modules', 'sharp')
    mkdirSync(staleDir, { recursive: true })
    writeFileSync(join(staleDir, 'stale.node'), 'old')
    const embedded = buildEmbedded({ 'node_modules/sharp/lib/sharp.node': 'fake-native-bytes' })

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
    const { manifestRaw, getAsset } = buildEmbedded({ 'node_modules/sharp/lib/sharp.node': 'x' }, 'aix-ppc64')

    expect(() => extractNatives({ manifestRaw, cacheDir, getAsset, logger: silentLogger })).toThrow(
      /target mismatch.*aix-ppc64/,
    )
  })

  it('throws when an embedded asset fails its sha256 check', () => {
    const cacheDir = makeTmpDir()
    const { manifestRaw } = buildEmbedded({ 'node_modules/sharp/lib/sharp.node': 'expected' })
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
