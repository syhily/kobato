import type { RouteManifest } from '@kobato/distribution/route-warmup'

import { deriveTier2RouteIds, IDLE_SIZE_LIMIT, routeWarmupPlugin, TIER1_ROUTES } from '@kobato/pack/vite/route-warmup'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const WARMUP_ENTRY = fileURLToPath(
  new URL('../../../../../apps/sayaka/src/route-warmup/idle-script.entry.ts', import.meta.url),
)

function buildManifest(prefix: string, assetBase = '/assets/'): string {
  const asset = (name: string) => `${assetBase}${name}.js`
  return `${prefix}${JSON.stringify(
    {
      entry: { module: asset('entry'), imports: [asset('runtime')] },
      routes: {
        root: { id: 'root', module: asset('root'), imports: [] },
        'routes/layout': { id: 'routes/layout', module: asset('layout'), imports: [asset('layout-shared')] },
        'routes/home': {
          id: 'routes/home',
          module: asset('home'),
          imports: [asset('shared')],
          clientLoaderModule: asset('home-loader'),
        },
        'routes/archives': { id: 'routes/archives', module: asset('archives'), imports: [asset('shared')] },
        'routes/post/detail': {
          id: 'routes/post/detail',
          module: asset('post-detail'),
          imports: [asset('canvas-hl')],
        },
        'home-page': { id: 'home-page', module: asset('home'), imports: [] },
      },
    },
    null,
    2,
  )};\n`
}

let buildRoot: string
let assetsDir: string

beforeEach(() => {
  buildRoot = mkdtempSync(join(tmpdir(), 'kobato-route-warmup-'))
  assetsDir = join(buildRoot, 'client', 'assets')
  mkdirSync(assetsDir, { recursive: true })
})

afterEach(() => {
  rmSync(buildRoot, { recursive: true, force: true })
})

function manifestPath(): string {
  return join(assetsDir, 'warmup-manifest.json')
}

function addChunk(name: string, size = 1024): void {
  writeFileSync(join(assetsDir, `${name}.js`), Buffer.alloc(size, 1))
}

function addManifestFile(content: string): void {
  writeFileSync(join(assetsDir, 'manifest-abc.js'), content)
}

function buildPluginContext() {
  const written: Record<string, string> = {}
  return {
    written,
    ctx: {
      environment: undefined,
      options: { dir: join(buildRoot, 'server') } as { dir?: string },
      async writeFile(path: string, content: string) {
        written[path] = content
      },
    },
  }
}

async function invokeWriteBundle(ctx: ReturnType<typeof buildPluginContext>['ctx']): Promise<void> {
  const plugin = routeWarmupPlugin({ warmupEntry: WARMUP_ENTRY })
  const writeBundle = (plugin as { writeBundle: { handler: (o: unknown, b: unknown) => Promise<void> } }).writeBundle
  await writeBundle.handler.call(ctx, ctx.options, {})
}

function readWarmupManifest(): Record<string, string[]> {
  return JSON.parse(readFileSync(manifestPath(), 'utf8')) as Record<string, string[]>
}

describe('route-warmup plugin — writeBundle handler', () => {
  it('is a Vite plugin with the expected shape', () => {
    const plugin = routeWarmupPlugin({ warmupEntry: WARMUP_ENTRY })
    expect(plugin.name).toBe('route-warmup')
    expect(plugin.enforce).toBe('post')
    expect(plugin.writeBundle).toBeDefined()
  })

  it('skips when there is no server outDir', async () => {
    const { ctx } = buildPluginContext()
    ctx.options = {}
    await invokeWriteBundle(ctx)
  })

  it('skips when the client assets dir does not exist', async () => {
    rmSync(assetsDir, { recursive: true, force: true })
    const { ctx } = buildPluginContext()
    await invokeWriteBundle(ctx)
    expect(existsSync(manifestPath())).toBe(false)
  })

  it('skips when no manifest file is found in the client assets dir', async () => {
    addChunk('entry', 100)

    const { ctx } = buildPluginContext()
    await invokeWriteBundle(ctx)

    expect(existsSync(manifestPath())).toBe(false)
  })

  it('skips when the manifest is present but malformed (no window prefix)', async () => {
    addManifestFile('not-the-expected-prefix')

    const { ctx } = buildPluginContext()
    await invokeWriteBundle(ctx)

    expect(existsSync(manifestPath())).toBe(false)
  })

  it('skips when the parsed manifest has 0 routes', async () => {
    addManifestFile(
      `window.__reactRouterManifest=${JSON.stringify({ entry: { module: '', imports: [] }, routes: {} })};`,
    )

    const { ctx } = buildPluginContext()
    await invokeWriteBundle(ctx)

    expect(existsSync(manifestPath())).toBe(false)
  })

  it('writes a warmup-manifest.json with a tier1 and one tier2 that tier, dedupe, and filter chunks', async () => {
    addManifestFile(buildManifest('window.__reactRouterManifest='))

    for (const name of [
      'entry',
      'runtime',
      'root',
      'layout',
      'layout-shared',
      'home',
      'shared',
      'home-loader',
      'archives',
      'post-detail',
      'canvas-hl',
    ]) {
      addChunk(name)
    }

    const { ctx } = buildPluginContext()
    await invokeWriteBundle(ctx)

    const manifest = readWarmupManifest()
    expect(Object.keys(manifest).sort()).toEqual(['tier1', 'tier2', 'version'])

    expect(manifest.tier1).toEqual(
      expect.arrayContaining([
        '/assets/root.js',
        '/assets/layout.js',
        '/assets/layout-shared.js',
        '/assets/home.js',
        '/assets/home-loader.js',
        '/assets/runtime.js',
        '/assets/shared.js',
      ]),
    )

    expect(manifest.tier2).toContain('/assets/archives.js')
    expect(manifest.tier2).toContain('/assets/post-detail.js')
    expect(manifest.tier2).not.toContain('/assets/shared.js')
    expect(manifest.tier2).not.toContain('/assets/home.js')

    for (const tier of ['tier1', 'tier2']) {
      expect(manifest[tier]).not.toContain('/assets/canvas-hl.js')
    }
  })

  it('keys the idle cap on the hrefs the manifest carries: an oversized chunk under a base prefix is excluded', async () => {
    addManifestFile(buildManifest('window.__reactRouterManifest=', '/admin/assets/'))

    for (const name of ['entry', 'runtime', 'root', 'layout', 'home', 'shared', 'home-loader', 'post-detail']) {
      addChunk(name)
    }
    addChunk('archives', IDLE_SIZE_LIMIT + 1)
    addChunk('layout-shared', IDLE_SIZE_LIMIT + 1)

    const { ctx } = buildPluginContext()
    await invokeWriteBundle(ctx)

    const manifest = readWarmupManifest()
    expect(manifest.tier2).toContain('/admin/assets/post-detail.js')
    expect(manifest.tier2).not.toContain('/admin/assets/archives.js')
    expect(manifest.tier1).toContain('/admin/assets/layout-shared.js')
  })
})

describe('route-warmup tier derivation', () => {
  const manifestOf = (ids: string[]): RouteManifest => ({
    entry: { module: '/assets/entry.js', imports: [] },
    routes: Object.fromEntries(ids.map((id) => [id, { id, module: `/assets/${id}.js`, imports: [] }])),
  })

  it('defaults to the public tiers: every prefixed id outside tier 1, skipping tier 1 and custom ids', () => {
    const manifest = manifestOf([
      'root',
      'routes/layout',
      'routes/home',
      'routes/archives',
      'routes/post/detail',
      'home-page',
      'branding-logo',
    ])
    expect(deriveTier2RouteIds(manifest)).toEqual(['routes/archives', 'routes/post/detail'])
  })

  it('honours the tiering it is given', () => {
    const manifest = manifestOf(['root', 'routes/public/home', 'routes/admin/dashboard', 'routes/editor/post/new'])
    expect(
      deriveTier2RouteIds(manifest, {
        tier1Routes: ['root', 'routes/public/home'],
        tier2Prefixes: ['routes/admin/', 'routes/editor/'],
      }),
    ).toEqual(['routes/admin/dashboard', 'routes/editor/post/new'])
  })

  it('never places a tier-1 route in tier 2', () => {
    for (const id of TIER1_ROUTES) {
      expect(deriveTier2RouteIds(manifestOf([id])), `TIER1 route "${id}" leaked into tier 2`).toEqual([])
    }
  })
})

describe('route-warmup plugin — environment guards', () => {
  it('skips when running under the client Vite environment', async () => {
    addManifestFile(buildManifest('window.__reactRouterManifest='))
    const { ctx } = buildPluginContext()
    ;(ctx as unknown as { environment: unknown }).environment = { name: 'client' }

    await invokeWriteBundle(ctx)

    expect(existsSync(manifestPath())).toBe(false)
  })

  it('skips older Vite SSR builds (no environment API + options.ssr)', async () => {
    addManifestFile(buildManifest('window.__reactRouterManifest='))
    const { ctx } = buildPluginContext()
    ;(ctx.options as { ssr?: boolean }).ssr = true

    await invokeWriteBundle(ctx)

    expect(existsSync(manifestPath())).toBe(false)
  })
})
