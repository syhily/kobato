import type sharpDefault from 'sharp'

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getEmbeddedAsset, isSea, listEmbeddedAssetKeys, requireExternal, resolveCacheDir } from '@/server/infra/sea'

// Unit tests for the SEA runtime helpers. Under vitest every SEA-specific
// read path must degrade gracefully (null / [] / false) and requireExternal
// must behave like a static import against the real node_modules tree.

const tmpDirs: string[] = []

function makeTmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'kobato-sea-test-'))
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  vi.unstubAllEnvs()
  while (tmpDirs.length > 0) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true })
  }
})

describe('infra/sea — SEA detection and embedded assets', () => {
  it('isSea() is false under vitest', () => {
    expect(isSea()).toBe(false)
  })

  it('getEmbeddedAsset returns null when not running as a SEA', () => {
    expect(getEmbeddedAsset('client/assets/warmup-manifest.json')).toBeNull()
  })

  it('listEmbeddedAssetKeys returns [] when not running as a SEA', () => {
    expect(listEmbeddedAssetKeys('client/assets/')).toEqual([])
  })
})

describe('infra/sea — requireExternal', () => {
  it('resolves packages from the real node_modules tree', () => {
    const sharp = requireExternal<typeof sharpDefault>('sharp')
    expect(typeof sharp).toBe('function')
    // Callable: returns a pipeline without touching input bytes until an output method runs.
    const pipeline = sharp(Buffer.alloc(8))
    expect(typeof pipeline.metadata).toBe('function')
  })

  it('resolves packages from KOBATO_NATIVES_DIR when set', () => {
    // KOBATO_NATIVES_DIR mirrors the extracted `<cache>/natives-<hash>/node_modules` tree.
    const dir = makeTmpDir()
    const nativesDir = join(dir, 'node_modules')
    const pkgDir = join(nativesDir, 'fake-native-pkg')
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: 'fake-native-pkg', main: 'index.js' }))
    writeFileSync(join(pkgDir, 'index.js'), 'module.exports = { marker: 42 }\n')
    vi.stubEnv('KOBATO_NATIVES_DIR', nativesDir)

    const mod = requireExternal<{ marker: number }>('fake-native-pkg')
    expect(mod.marker).toBe(42)
  })
})

describe('infra/sea — resolveCacheDir', () => {
  it('prefers KOBATO_CACHE_DIR over everything else', () => {
    vi.stubEnv('KOBATO_CACHE_DIR', '/data/kobato-cache')
    vi.stubEnv('XDG_CACHE_HOME', '/data/xdg')
    expect(resolveCacheDir()).toBe('/data/kobato-cache')
  })

  it('falls back to $XDG_CACHE_HOME/kobato', () => {
    vi.stubEnv('KOBATO_CACHE_DIR', undefined)
    vi.stubEnv('XDG_CACHE_HOME', '/data/xdg')
    expect(resolveCacheDir()).toBe(join('/data/xdg', 'kobato'))
  })

  it('falls back to ~/.cache/kobato when neither env var is set', () => {
    vi.stubEnv('KOBATO_CACHE_DIR', undefined)
    vi.stubEnv('XDG_CACHE_HOME', undefined)
    expect(resolveCacheDir()).toBe(join(homedir(), '.cache', 'kobato'))
  })

  describe('on Windows', () => {
    const realPlatform = process.platform

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32' })
    })

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: realPlatform })
    })

    it('falls back to %LOCALAPPDATA%\\kobato', () => {
      vi.stubEnv('KOBATO_CACHE_DIR', undefined)
      vi.stubEnv('XDG_CACHE_HOME', '/data/xdg')
      vi.stubEnv('LOCALAPPDATA', 'C:\\Users\\test\\AppData\\Local')
      expect(resolveCacheDir()).toBe(join('C:\\Users\\test\\AppData\\Local', 'kobato'))
    })

    it('falls back to ~/AppData/Local/kobato when LOCALAPPDATA is unset', () => {
      vi.stubEnv('KOBATO_CACHE_DIR', undefined)
      vi.stubEnv('LOCALAPPDATA', undefined)
      expect(resolveCacheDir()).toBe(join(homedir(), 'AppData', 'Local', 'kobato'))
    })
  })
})
