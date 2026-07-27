import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock `node:fs` so we can drive every branch of `routeWarmupPlugin`'s
// writeBundle handler (manifest missing, malformed, route dedup, idle
// size filter, editor-only filter, canvas exclusion) without touching disk.
const fsState = vi.hoisted(() => {
  return {
    files: new Map<string, string | Buffer>(),
    dirExists: new Set<string>(),
    sizes: new Map<string, number>(),
  }
})

vi.mock('node:fs', () => ({
  existsSync: (p: string) => fsState.dirExists.has(String(p)),
  readdirSync: (dir: string) => {
    const prefix = String(dir)
    return [...fsState.files.keys()]
      .filter((k) => k.startsWith(prefix + '/') || k === prefix)
      .map((k) => k.slice(prefix.length + 1))
  },
  readFileSync: (file: string) => {
    const v = fsState.files.get(String(file))
    if (v === undefined) {
      throw new Error(`ENOENT: ${file}`)
    }
    return v
  },
  statSync: (file: string) => ({ size: fsState.sizes.get(String(file)) ?? 0 }),
  writeFileSync: (file: string, content: string) => {
    fsState.files.set(String(file), content)
  },
}))

import { join } from 'node:path'

import type { RouteManifest } from '@/shared/constants/route-warmup'

import routes from '@/routes'
import {
  deriveTier2RouteIds,
  routeWarmupPlugin,
  TIER1_ROUTES,
  tier2BucketForRouteId,
} from '@/server/infra/route-warmup'

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
          imports: ['/assets/editor-tiptap-core.js'],
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

function buildPluginContext() {
  const written: Record<string, string> = {}
  const logs: string[] = []
  const errors: string[] = []
  return {
    written,
    logs,
    errors,
    ctx: {
      // writeBundle runs under the SSR environment in production; tests
      // simulate "no environment API + SSR build" by leaving `environment`
      // unset and the options.ssr flag off, so neither early-return fires.
      environment: undefined,
      options: { dir: '/build/server' } as { dir?: string },
      async writeFile(path: string, content: string) {
        written[String(path)] = content
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
  beforeEach(() => {
    fsState.files.clear()
    fsState.dirExists.clear()
    fsState.sizes.clear()
  })

  it('is a Vite plugin with the expected shape', () => {
    const plugin = routeWarmupPlugin()
    expect(plugin.name).toBe('route-warmup')
    expect(plugin.enforce).toBe('post')
    expect(plugin.writeBundle).toBeDefined()
  })

  it('skips when there is no server outDir', async () => {
    const { ctx } = buildPluginContext()
    ctx.options = {}
    // Should not throw — just no-op.
    await invokeWriteBundle(ctx)
  })

  it('skips when the client assets dir does not exist', async () => {
    const { ctx } = buildPluginContext()
    // The default dir resolves to /build/client/assets, which is not in
    // the existsSync allow-list.
    await invokeWriteBundle(ctx)
    // Nothing was written (warmup-manifest.json absent).
    expect(fsState.files.has('/build/client/assets/warmup-manifest.json')).toBe(false)
  })

  it('skips when no manifest file is found in the client assets dir', async () => {
    fsState.dirExists.add('/build/client/assets')
    // List-able directory but no manifest-*.js file inside.
    fsState.files.set('/build/client/assets/entry.js', '')
    fsState.sizes.set('/build/client/assets/entry.js', 100)

    const { ctx } = buildPluginContext()
    await invokeWriteBundle(ctx)

    expect(fsState.files.has('/build/client/assets/warmup-manifest.json')).toBe(false)
  })

  it('skips when the manifest is present but malformed (no window prefix)', async () => {
    fsState.dirExists.add('/build/client/assets')
    fsState.files.set('/build/client/assets/manifest-abc.js', 'not-the-expected-prefix')
    fsState.sizes.set('/build/client/assets/manifest-abc.js', 100)

    const { ctx } = buildPluginContext()
    await invokeWriteBundle(ctx)

    expect(fsState.files.has('/build/client/assets/warmup-manifest.json')).toBe(false)
  })

  it('skips when the parsed manifest has 0 routes', async () => {
    fsState.dirExists.add('/build/client/assets')
    fsState.files.set(
      '/build/client/assets/manifest-abc.js',
      `window.__reactRouterManifest=${JSON.stringify({ entry: { module: '', imports: [] }, routes: {} })};`,
    )
    fsState.sizes.set('/build/client/assets/manifest-abc.js', 100)

    const { ctx } = buildPluginContext()
    await invokeWriteBundle(ctx)

    expect(fsState.files.has('/build/client/assets/warmup-manifest.json')).toBe(false)
  })

  it('writes a warmup-manifest.json that tiers, dedupes, and filters chunks', async () => {
    fsState.dirExists.add('/build/client/assets')
    fsState.files.set('/build/client/assets/manifest-abc.js', buildManifest('window.__reactRouterManifest='))
    fsState.sizes.set('/build/client/assets/manifest-abc.js', 100)

    // Per-chunk sizes for the idle-tier filter. Everything is small so
    // all chunks survive the IDLE_SIZE_LIMIT gate.
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
      'editor-tiptap-core',
      'signin',
      'canvas-hl',
    ]) {
      fsState.files.set(`/build/client/assets/${name}.js`, '')
      fsState.sizes.set(`/build/client/assets/${name}.js`, 1024)
    }

    const { ctx } = buildPluginContext()
    await invokeWriteBundle(ctx)

    const raw = fsState.files.get('/build/client/assets/warmup-manifest.json')
    expect(typeof raw).toBe('string')
    const manifest = JSON.parse(raw as string)

    // tier1 is the public launch route: root + home + entry imports.
    expect(manifest.tier1).toEqual(
      expect.arrayContaining([
        '/assets/root.js',
        '/assets/home.js',
        '/assets/home-loader.js',
        '/assets/runtime.js',
        '/assets/shared.js',
      ]),
    )

    // tier2_public is empty in this minimal manifest because no secondary
    // public routes are defined.
    expect(manifest.tier2_public).toEqual([])

    // tier2_admin excludes editor-only chunks; the editor tier keeps them.
    expect(manifest.tier2_admin).toContain('/assets/dashboard.js')
    expect(manifest.tier2_admin).not.toContain('/assets/editor-tiptap-core.js')
    expect(manifest.tier2_editor).toContain('/assets/editor-post.js')
    expect(manifest.tier2_editor).toContain('/assets/editor-tiptap-core.js')

    // Lazy-only / native canvas chunks are excluded from every tier.
    for (const tier of ['tier1', 'tier2_public', 'tier2_admin', 'tier2_editor', 'tier2_auth']) {
      expect(manifest[tier]).not.toContain('/assets/canvas-hl.js')
    }
  })

  it('excludes chunks larger than IDLE_SIZE_LIMIT from idle tiers', async () => {
    fsState.dirExists.add('/build/client/assets')
    fsState.files.set('/build/client/assets/manifest-abc.js', buildManifest('window.__reactRouterManifest='))
    fsState.sizes.set('/build/client/assets/manifest-abc.js', 100)
    // dashboard.js is 200KB — bigger than the 100KB idle cap.
    for (const name of ['entry', 'runtime', 'root', 'home', 'shared', 'dashboard', 'admin-shared']) {
      fsState.files.set(`/build/client/assets/${name}.js`, '')
      fsState.sizes.set(`/build/client/assets/${name}.js`, 1024)
    }
    fsState.sizes.set('/build/client/assets/dashboard.js', 200 * 1024)

    const { ctx } = buildPluginContext()
    await invokeWriteBundle(ctx)

    const manifest = JSON.parse(fsState.files.get('/build/client/assets/warmup-manifest.json') as string)
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
    // 'routes/public/layout' and 'routes/public/home' start with
    // 'routes/public/' but must stay tier-1-only.
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
      // React Router derives the manifest ID from the file path; an
      // explicit `id` overrides it (paginated aliases). Aliases share the
      // base file's chunk, so the base ID's bucket covers them.
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
  beforeEach(() => {
    fsState.files.clear()
    fsState.dirExists.clear()
    fsState.sizes.clear()
  })

  it('skips when running under the client Vite environment', async () => {
    // Mirror the v8_viteEnvironmentApi path: env.name === 'client'.
    const { ctx } = buildPluginContext()
    ;(ctx as unknown as { environment: unknown }).environment = { name: 'client' }
    fsState.dirExists.add('/build/client/assets')
    fsState.files.set('/build/client/assets/manifest-abc.js', buildManifest('window.__reactRouterManifest='))

    await invokeWriteBundle(ctx)

    expect(fsState.files.has('/build/client/assets/warmup-manifest.json')).toBe(false)
  })

  it('skips older Vite SSR builds (no environment API + options.ssr)', async () => {
    const { ctx } = buildPluginContext()
    ;(ctx.options as { ssr?: boolean }).ssr = true
    fsState.dirExists.add('/build/client/assets')
    fsState.files.set('/build/client/assets/manifest-abc.js', buildManifest('window.__reactRouterManifest='))

    await invokeWriteBundle(ctx)

    expect(fsState.files.has('/build/client/assets/warmup-manifest.json')).toBe(false)
  })
})
