import { nativeRequire } from '@kobato/server/infra/native-require'
import {
  SEA_NATIVE_META_LIBVIPS_PACKAGE_KEY,
  SEA_NATIVE_META_LIBVIPS_VERSIONS_KEY,
  SEA_NATIVE_META_SHARP_PACKAGE_KEY,
  SEA_NATIVE_META_SHARP_VERSIONS_KEY,
} from '@kobato/shared/sea/assets'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Unit tests for `nativeRequire` — the runtime half of the SEA native
// redirect. `@kobato/server/infra/sea` is mocked so both modes are exercisable
// under vitest (which never runs as a SEA): with `KOBATO_NATIVES_DIR`
// set the addon loads must root at the flat natives dir and the metadata
// probes must come from the embedded assets; without it every recognized
// specifier must pass through to `requireExternal` (regular node_modules
// resolution — itself covered by `tests/unit/server/infra/sea.test.ts`).

const seaMock = vi.hoisted(() => ({
  requireExternal: vi.fn<(name: string) => unknown>((name) => ({ passthrough: name })),
  getEmbeddedAsset: vi.fn<(key: string) => Buffer | null>(() => null),
}))

vi.mock('@kobato/server/infra/sea', () => ({
  requireExternal: seaMock.requireExternal,
  getEmbeddedAsset: seaMock.getEmbeddedAsset,
}))

// The specifier triples are computed from the runtime host, exactly like
// the module under test does (the build is platform-native).
function isMuslLinux(): boolean {
  const getReport = process.report?.getReport
  if (typeof getReport !== 'function') {
    return false
  }
  const report = getReport.call(process.report) as { header?: { glibcVersionRuntime?: string } }
  return report.header?.glibcVersionRuntime === undefined
}
const SHARP_PLATFORM =
  process.platform === 'linux' && isMuslLinux() ? `linuxmusl-${process.arch}` : `${process.platform}-${process.arch}`
const CANVAS_TRIPLE =
  process.platform === 'linux'
    ? `linux-${process.arch}-${isMuslLinux() ? 'musl' : 'gnu'}`
    : process.platform === 'win32'
      ? `win32-${process.arch}-msvc`
      : `${process.platform}-${process.arch}`

const SHARP_ADDON_SPEC = `@img/sharp-${SHARP_PLATFORM}/sharp.node`
const SHARP_PACKAGE_SPEC = `@img/sharp-${SHARP_PLATFORM}/package`
const SHARP_VERSIONS_SPEC = `@img/sharp-${SHARP_PLATFORM}/versions`
const LIBVIPS_VERSIONS_SPEC = `@img/sharp-libvips-${SHARP_PLATFORM}/versions`
const LIBVIPS_PACKAGE_SPEC = `@img/sharp-libvips-${SHARP_PLATFORM}/package`
const LIBVIPS_LIB_SPEC = `@img/sharp-libvips-${SHARP_PLATFORM}/lib`
const CANVAS_ADDON_SPEC = `@napi-rs/canvas-${CANVAS_TRIPLE}`

const METADATA: Record<string, unknown> = {
  [SEA_NATIVE_META_LIBVIPS_VERSIONS_KEY]: { vips: '8.18.3' },
  [SEA_NATIVE_META_LIBVIPS_PACKAGE_KEY]: { name: `@img/sharp-libvips-${SHARP_PLATFORM}` },
  [SEA_NATIVE_META_SHARP_PACKAGE_KEY]: { name: `@img/sharp-${SHARP_PLATFORM}` },
  [SEA_NATIVE_META_SHARP_VERSIONS_KEY]: { vips: '8.18.3', sharp: '0.35.3' },
}

const tmpDirs: string[] = []

function makeNativesDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kobato-native-require-test-'))
  tmpDirs.push(dir)
  return dir
}

beforeEach(() => {
  vi.clearAllMocks()
  seaMock.requireExternal.mockImplementation((name) => ({ passthrough: name }))
  seaMock.getEmbeddedAsset.mockImplementation((key) => {
    const value = METADATA[key]
    return value === undefined ? null : Buffer.from(JSON.stringify(value), 'utf-8')
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  while (tmpDirs.length > 0) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true })
  }
})

describe('infra/native-require — under SEA (KOBATO_NATIVES_DIR set)', () => {
  it('loads the sharp addon by absolute path from the flat natives dir', () => {
    const dir = makeNativesDir()
    vi.stubEnv('KOBATO_NATIVES_DIR', dir)

    nativeRequire(SHARP_ADDON_SPEC)

    expect(seaMock.requireExternal).toHaveBeenCalledWith(join(dir, 'sharp.node'))
  })

  it('loads the skia addon by absolute path from the flat natives dir', () => {
    const dir = makeNativesDir()
    vi.stubEnv('KOBATO_NATIVES_DIR', dir)

    nativeRequire(CANVAS_ADDON_SPEC)

    expect(seaMock.requireExternal).toHaveBeenCalledWith(join(dir, 'skia.node'))
  })

  it('answers the metadata probes from the embedded assets', () => {
    const dir = makeNativesDir()
    vi.stubEnv('KOBATO_NATIVES_DIR', dir)

    expect(nativeRequire(LIBVIPS_VERSIONS_SPEC)).toEqual({ vips: '8.18.3' })
    expect(nativeRequire(LIBVIPS_PACKAGE_SPEC)).toEqual({ name: `@img/sharp-libvips-${SHARP_PLATFORM}` })
    expect(nativeRequire(SHARP_PACKAGE_SPEC)).toEqual({ name: `@img/sharp-${SHARP_PLATFORM}` })
    expect(nativeRequire(SHARP_VERSIONS_SPEC)).toEqual({ vips: '8.18.3', sharp: '0.35.3' })
    expect(seaMock.requireExternal).not.toHaveBeenCalled()
  })

  it('throws when the platform versions metadata was not embedded (non-win32 builds)', () => {
    const dir = makeNativesDir()
    vi.stubEnv('KOBATO_NATIVES_DIR', dir)
    seaMock.getEmbeddedAsset.mockReturnValue(null)

    // Mirrors the upstream MODULE_NOT_FOUND the platform package's missing
    // ./versions export produces — sharp's own try/catch absorbs it and
    // falls back to the libvips versions probe.
    expect(() => nativeRequire(SHARP_VERSIONS_SPEC)).toThrow(/embedded metadata asset missing/)
  })

  it('answers the libvips lib probe with the flat natives dir', () => {
    const dir = makeNativesDir()
    vi.stubEnv('KOBATO_NATIVES_DIR', dir)

    expect(nativeRequire(LIBVIPS_LIB_SPEC)).toBe(dir)
  })

  it('throws on anything outside the enumerated set', () => {
    const dir = makeNativesDir()
    vi.stubEnv('KOBATO_NATIVES_DIR', dir)

    // The packages' own try/catch chains absorb these — build-from-source
    // probes, relative addon attempts, wasm candidates, dev headers.
    expect(() => nativeRequire(`../src/build/Release/sharp-${SHARP_PLATFORM}-0.35.3.node`)).toThrow(
      /unresolvable specifier/,
    )
    expect(() => nativeRequire(`./skia.${CANVAS_TRIPLE}.node`)).toThrow(/unresolvable specifier/)
    expect(() => nativeRequire('./skia.wasi.cjs')).toThrow(/unresolvable specifier/)
    expect(() => nativeRequire('@img/sharp-wasm32/versions')).toThrow(/unresolvable specifier/)
    expect(() => nativeRequire('@img/sharp-libvips-dev/include')).toThrow(/unresolvable specifier/)
    expect(() => nativeRequire(`@img/sharp-libvips-dev-${SHARP_PLATFORM}/lib`)).toThrow(/unresolvable specifier/)
    // Other platforms' triples are never ours to answer either.
    const other = SHARP_PLATFORM === 'darwin-x64' ? 'linux-x64' : 'darwin-x64'
    expect(() => nativeRequire(`@img/sharp-${other}/sharp.node`)).toThrow(/unresolvable specifier/)
  })
})

describe('infra/native-require — outside SEA (node_modules fallback)', () => {
  it('passes every recognized specifier through to requireExternal', () => {
    vi.stubEnv('KOBATO_NATIVES_DIR', undefined)

    for (const spec of [
      SHARP_ADDON_SPEC,
      CANVAS_ADDON_SPEC,
      LIBVIPS_VERSIONS_SPEC,
      LIBVIPS_PACKAGE_SPEC,
      SHARP_PACKAGE_SPEC,
      SHARP_VERSIONS_SPEC,
      LIBVIPS_LIB_SPEC,
    ]) {
      expect(nativeRequire(spec)).toEqual({ passthrough: spec })
    }
    expect(seaMock.getEmbeddedAsset).not.toHaveBeenCalled()
  })

  it('treats an empty KOBATO_NATIVES_DIR as unset', () => {
    vi.stubEnv('KOBATO_NATIVES_DIR', '')

    expect(nativeRequire(SHARP_ADDON_SPEC)).toEqual({ passthrough: SHARP_ADDON_SPEC })
  })

  it('throws on anything outside the enumerated set', () => {
    vi.stubEnv('KOBATO_NATIVES_DIR', undefined)

    expect(() => nativeRequire('../src/build/Release/sharp-darwin-x64-0.35.3.node')).toThrow(/unresolvable specifier/)
    expect(() => nativeRequire('@napi-rs/canvas-wasm32-wasi')).toThrow(/unresolvable specifier/)
  })
})
