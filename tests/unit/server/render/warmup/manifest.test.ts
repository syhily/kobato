import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fsState = {
  existsSync: vi.fn<(path: string) => boolean>(),
  readFileSync: vi.fn<(path: string, encoding: string) => string>(),
  readdirSync: vi.fn<(path: string) => string[]>(),
}

vi.mock('node:fs', () => ({
  existsSync: (path: string) => fsState.existsSync(path),
  readFileSync: (path: string, encoding: string) => fsState.readFileSync(path, encoding),
  readdirSync: (path: string) => fsState.readdirSync(path),
}))

beforeEach(() => {
  fsState.existsSync.mockReset()
  fsState.readFileSync.mockReset()
  fsState.readdirSync.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

function buildClientManifest(): string {
  return `window.__reactRouterManifest=${JSON.stringify(
    {
      entry: { module: '/assets/entry.js', imports: ['/assets/runtime.js'] },
      routes: {
        root: { id: 'root', path: '', module: '/assets/root.js', imports: [] },
        'routes/public/layout': {
          id: 'routes/public/layout',
          parentId: 'root',
          module: '/assets/public-layout.js',
          imports: ['/assets/public-chrome.js'],
        },
        'routes/public/home': {
          id: 'routes/public/home',
          parentId: 'routes/public/layout',
          index: true,
          module: '/assets/home.js',
          imports: ['/assets/shared.js'],
        },
        'routes/public/post/detail': {
          id: 'routes/public/post/detail',
          parentId: 'routes/public/layout',
          path: 'posts/:slug',
          module: '/assets/post-detail.js',
          imports: ['/assets/sanitize-html.js'],
        },
        'routes/admin/layout': {
          id: 'routes/admin/layout',
          parentId: 'root',
          module: '/assets/admin-layout.js',
          imports: ['/assets/admin-shell.js'],
        },
        'routes/admin/dashboard': {
          id: 'routes/admin/dashboard',
          parentId: 'routes/admin/layout',
          path: 'admin',
          index: true,
          module: '/assets/dashboard.js',
          imports: [],
        },
        'routes/auth/layout': {
          id: 'routes/auth/layout',
          parentId: 'root',
          module: '/assets/auth-layout.js',
          imports: [],
        },
        'routes/auth/signin': {
          id: 'routes/auth/signin',
          parentId: 'routes/auth/layout',
          path: 'admin/signin',
          module: '/assets/signin.js',
          imports: ['/assets/canvas-hl.js'],
        },
      },
    },
    null,
    2,
  )};\n`
}

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

describe('render/warmup/manifest — getCriticalChunksForPathname', () => {
  async function importManifestModule() {
    vi.stubEnv('DEV', false as never)
    vi.resetModules()
    fsState.existsSync.mockReturnValue(true)
    fsState.readdirSync.mockReturnValue(['manifest-abc.js'])
    fsState.readFileSync.mockReturnValue(buildClientManifest())
    return import('@/server/render/warmup/manifest')
  }

  it('returns null in dev environment', async () => {
    vi.resetModules()
    const { getCriticalChunksForPathname } = await import('@/server/render/warmup/manifest')
    vi.stubEnv('DEV', true as never)
    expect(getCriticalChunksForPathname('/')).toBeNull()
  })

  it('returns the home launch-route chunks for /', async () => {
    const { getCriticalChunksForPathname } = await importManifestModule()
    const chunks = getCriticalChunksForPathname('/')
    expect(chunks).toEqual(
      expect.arrayContaining([
        '/assets/entry.js',
        '/assets/runtime.js',
        '/assets/root.js',
        '/assets/public-layout.js',
        '/assets/public-chrome.js',
        '/assets/home.js',
        '/assets/shared.js',
      ]),
    )
  })

  it('returns route-specific chunks for a post detail URL', async () => {
    const { getCriticalChunksForPathname } = await importManifestModule()
    const chunks = getCriticalChunksForPathname('/posts/hello-world')
    expect(chunks).toContain('/assets/post-detail.js')
    expect(chunks).toContain('/assets/sanitize-html.js')
    expect(chunks).not.toContain('/assets/home.js')
  })

  it('returns admin launch-route chunks for /admin', async () => {
    const { getCriticalChunksForPathname } = await importManifestModule()
    const chunks = getCriticalChunksForPathname('/admin')
    expect(chunks).toContain('/assets/admin-layout.js')
    expect(chunks).toContain('/assets/admin-shell.js')
    expect(chunks).toContain('/assets/dashboard.js')
    expect(chunks).not.toContain('/assets/public-layout.js')
  })

  it('excludes lazy-only / native canvas chunks from the critical path', async () => {
    const { getCriticalChunksForPathname } = await importManifestModule()
    const chunks = getCriticalChunksForPathname('/admin/signin')
    expect(chunks).toContain('/assets/signin.js')
    expect(chunks).not.toContain('/assets/canvas-hl.js')
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
