import type { RouteManifest } from '@kobato/distribution/route-warmup'

import {
  deriveTier2RouteIds,
  routeWarmupPlugin,
  TIER1_ROUTES,
  tier2BucketForRouteId,
} from '@kobato/toolchain/src/vite/route-warmup'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import routes from '@/routes'

function buildManifest(prefix: string): string {
  return `${prefix}${JSON.stringify(
    {
      entry: { module: '/assets/entry.js', imports: ['/assets/runtime.js'] },
      routes: {
        root: { id: 'root', module: '/assets/root.js', imports: [] },
        'routes/public/home': {
          id: 'routes/public/home',
          module: '/assets/home.js',
          imports: ['/assets/shared.js'],
          clientLoaderModule: '/assets/home-loader.js',
        },
        'routes/admin/dashboard': {
          id: 'routes/admin/dashboard',
          module: '/assets/dashboard.js',
          imports: ['/assets/admin-shared.js'],
        },
        'routes/editor/post/new': {
          id: 'routes/editor/post/new',
          module: '/assets/editor-post.js',
          imports: ['/assets/editor-shared.js'],
        },
        'routes/auth/signin': {
          id: 'routes/auth/signin',
          module: '/assets/signin.js',
          imports: ['/assets/canvas-hl.js'],
        },
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
  const plugin = routeWarmupPlugin()
  const writeBundle = (plugin as { writeBundle: { handler: (o: unknown, b: unknown) => Promise<void> } }).writeBundle
  await writeBundle.handler.call(ctx, ctx.options, {})
}

describe('route-warmup plugin — writeBundle handler', () => {
  it('is a Vite plugin with the expected shape', () => {
    const plugin = routeWarmupPlugin()
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

  it('writes a warmup-manifest.json that tiers, dedupes, and filters chunks', async () => {
    addManifestFile(buildManifest('window.__reactRouterManifest='))

    for (const name of [
      'entry',
      'runtime',
      'root',
      'home',
      'shared',
      'home-loader',
      'dashboard',
      'admin-shared',
      'editor-post',
      'editor-shared',
      'signin',
      'canvas-hl',
    ]) {
      addChunk(name)
    }

    const { ctx } = buildPluginContext()
    await invokeWriteBundle(ctx)

    const manifest = JSON.parse(readFileSync(manifestPath(), 'utf8'))

    expect(manifest.tier1).toEqual(
      expect.arrayContaining([
        '/assets/root.js',
        '/assets/home.js',
        '/assets/home-loader.js',
        '/assets/runtime.js',
        '/assets/shared.js',
      ]),
    )

    expect(manifest.tier2_public).toEqual([])

    expect(manifest.tier2_admin).toContain('/assets/dashboard.js')
    expect(manifest.tier2_admin).not.toContain('/assets/editor-shared.js')
    expect(manifest.tier2_editor).toContain('/assets/editor-post.js')
    expect(manifest.tier2_editor).toContain('/assets/editor-shared.js')

    for (const tier of ['tier1', 'tier2_public', 'tier2_admin', 'tier2_editor', 'tier2_auth']) {
      expect(manifest[tier]).not.toContain('/assets/canvas-hl.js')
    }
  })

  it('excludes chunks larger than IDLE_SIZE_LIMIT from idle tiers', async () => {
    addManifestFile(buildManifest('window.__reactRouterManifest='))

    for (const name of ['entry', 'runtime', 'root', 'home', 'shared', 'admin-shared']) {
      addChunk(name)
    }
    addChunk('dashboard', 200 * 1024)

    const { ctx } = buildPluginContext()
    await invokeWriteBundle(ctx)

    const manifest = JSON.parse(readFileSync(manifestPath(), 'utf8'))
    expect(manifest.tier2_admin).not.toContain('/assets/dashboard.js')
  })
})

describe('route-warmup tier derivation', () => {
  const manifestOf = (ids: string[]): RouteManifest => ({
    entry: { module: '/assets/entry.js', imports: [] },
    routes: Object.fromEntries(ids.map((id) => [id, { id, module: `/assets/${id}.js`, imports: [] }])),
  })

  it('buckets route IDs by prefix and skips unprefixed IDs', () => {
    const manifest = manifestOf([
      'root',
      'routes/public/layout',
      'routes/public/home',
      'routes/public/archives',
      'routes/admin/dashboard',
      'routes/editor/post/new',
      'routes/auth/signin',
      'home-page',
      'category-list-page',
    ])
    expect(deriveTier2RouteIds(manifest)).toEqual({
      public: ['routes/public/archives'],
      admin: ['routes/admin/dashboard'],
      editor: ['routes/editor/post/new'],
      auth: ['routes/auth/signin'],
    })
  })

  it('excludes TIER1 members from prefix buckets even when they carry a prefix', () => {
    for (const id of TIER1_ROUTES) {
      const buckets = deriveTier2RouteIds(manifestOf([id]))
      expect(Object.values(buckets).flat(), `TIER1 route "${id}" leaked into a tier-2 bucket`).toEqual([])
    }
  })
})

describe('route-warmup tier derivation — src/routes.ts coverage', () => {
  interface RouteEntry {
    file: string
    id?: string
  }

  function flatten(entries: unknown[]): RouteEntry[] {
    const out: RouteEntry[] = []
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') {
        continue
      }
      if ('file' in entry) {
        out.push(entry as RouteEntry)
      }
      if ('children' in entry && Array.isArray((entry as { children?: unknown }).children)) {
        out.push(...flatten((entry as { children: unknown[] }).children))
      }
    }
    return out
  }

  it('every route declared in src/routes.ts lands in exactly one warmup bucket', () => {
    for (const entry of flatten(routes)) {
      const baseId = entry.file.replace(/\.tsx$/, '')
      const manifestId = entry.id ?? baseId
      const bucket =
        TIER1_ROUTES.includes(manifestId) || TIER1_ROUTES.includes(baseId)
          ? 'tier1'
          : (tier2BucketForRouteId(manifestId) ?? tier2BucketForRouteId(baseId))
      expect(
        bucket,
        `route "${manifestId}" (file ${entry.file}) is not covered by any warmup tier — ` +
          'add it to TIER1_ROUTES or mount it under a routes/{public,admin,editor,auth}/ prefix',
      ).not.toBeNull()
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
