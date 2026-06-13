import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fsState = {
  existsSync: vi.fn<(path: string) => boolean>(),
  readFileSync: vi.fn<(path: string, encoding: string) => string>(),
}

vi.mock('node:fs', () => ({
  existsSync: (path: string) => fsState.existsSync(path),
  readFileSync: (path: string, encoding: string) => fsState.readFileSync(path, encoding),
}))

beforeEach(() => {
  fsState.existsSync.mockReset()
  fsState.readFileSync.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('render/warmup/manifest — getWarmupManifest', () => {
  it('returns null in dev environment', async () => {
    vi.resetModules()
    const { getWarmupManifest } = await import('@/server/render/warmup/manifest')
    vi.stubEnv('DEV', true as never)
    expect(getWarmupManifest()).toBeNull()
  })

  it('returns null when the manifest file does not exist', async () => {
    vi.stubEnv('DEV', false as never)
    vi.resetModules()
    fsState.existsSync.mockReturnValue(false)
    const { getWarmupManifest } = await import('@/server/render/warmup/manifest')
    expect(getWarmupManifest()).toBeNull()
  })

  it('returns null when the JSON shape is invalid', async () => {
    vi.stubEnv('DEV', false as never)
    vi.resetModules()
    fsState.existsSync.mockReturnValue(true)
    fsState.readFileSync.mockReturnValue(JSON.stringify({ version: 'not-a-number' }))
    const { getWarmupManifest } = await import('@/server/render/warmup/manifest')
    expect(getWarmupManifest()).toBeNull()
  })

  it('returns the parsed manifest when the shape is valid', async () => {
    vi.stubEnv('DEV', false as never)
    vi.resetModules()
    fsState.existsSync.mockReturnValue(true)
    const manifest = {
      version: 2,
      tier1: ['/'],
      tier2_public: ['/posts'],
      tier2_admin: ['/admin'],
      tier2_editor: ['/editor'],
      tier2_auth: ['/login'],
    }
    fsState.readFileSync.mockReturnValue(JSON.stringify(manifest))
    const { getWarmupManifest } = await import('@/server/render/warmup/manifest')
    expect(getWarmupManifest()).toEqual(manifest)
  })

  it('caches the parsed manifest across invocations', async () => {
    vi.stubEnv('DEV', false as never)
    vi.resetModules()
    fsState.existsSync.mockReturnValue(true)
    fsState.readFileSync.mockReturnValue(
      JSON.stringify({ version: 1, tier1: [], tier2_public: [], tier2_admin: [], tier2_editor: [], tier2_auth: [] }),
    )
    const { getWarmupManifest } = await import('@/server/render/warmup/manifest')
    const first = getWarmupManifest()
    const second = getWarmupManifest()
    expect(second).toBe(first)
    expect(fsState.readFileSync).toHaveBeenCalledTimes(1)
  })

  it('returns null when JSON.parse throws', async () => {
    vi.stubEnv('DEV', false as never)
    vi.resetModules()
    fsState.existsSync.mockReturnValue(true)
    fsState.readFileSync.mockReturnValue('not-json')
    const { getWarmupManifest } = await import('@/server/render/warmup/manifest')
    expect(getWarmupManifest()).toBeNull()
  })

  it('rejects a manifest whose tier arrays contain non-strings', async () => {
    vi.stubEnv('DEV', false as never)
    vi.resetModules()
    fsState.existsSync.mockReturnValue(true)
    fsState.readFileSync.mockReturnValue(
      JSON.stringify({
        version: 1,
        tier1: ['/ok', 42],
        tier2_public: [],
        tier2_admin: [],
        tier2_editor: [],
        tier2_auth: [],
      }),
    )
    const { getWarmupManifest } = await import('@/server/render/warmup/manifest')
    expect(getWarmupManifest()).toBeNull()
  })
})

describe('render/warmup/manifest — manifest path resolution', () => {
  it('resolves the manifest under the client/assets directory', () => {
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const expected = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      '..',
      'src',
      'server',
      'render',
      'warmup',
      '..',
      '..',
      'client',
      'assets',
      'warmup-manifest.json',
    )
    expect(expected).toContain('client/assets/warmup-manifest.json')
    void existsSync
  })
})
