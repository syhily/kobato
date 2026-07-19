import { describe, expect, it } from 'vitest'

import type { RouteManifest } from '@/shared/constants/route-warmup'

import { collectManifestChunks, isWarmupManifest, parseClientManifest } from '@/shared/route-warmup/manifest'

const PREFIX = 'window.__reactRouterManifest='

function makeManifest(): RouteManifest {
  return {
    entry: { module: '/assets/entry.js', imports: ['/assets/runtime.js'] },
    routes: {
      root: {
        id: 'root',
        module: '/assets/root.js',
        imports: ['/assets/runtime.js', '/assets/root-shared.js'],
        clientLoaderModule: '/assets/root-loader.js',
      },
      'routes/public/home': {
        id: 'routes/public/home',
        parentId: 'root',
        index: true,
        module: '/assets/home.js',
        imports: ['/assets/shared.js'],
        clientActionModule: '/assets/home-action.js',
        clientLoaderModule: '/assets/home-loader.js',
        clientMiddlewareModule: '/assets/home-middleware.js',
        hydrateFallbackModule: '/assets/home-fallback.js',
      },
    },
  }
}

function serializeManifest(manifest: unknown): string {
  return `${PREFIX}${JSON.stringify(manifest)};\n`
}

describe('shared/route-warmup/manifest — parseClientManifest', () => {
  it('strips the window.__reactRouterManifest= prefix and trailing semicolon', () => {
    const manifest = makeManifest()
    expect(parseClientManifest(serializeManifest(manifest))).toEqual(manifest)
  })

  it('round-trips a well-formed manifest without a trailing semicolon', () => {
    const manifest = makeManifest()
    expect(parseClientManifest(`${PREFIX}${JSON.stringify(manifest)}`)).toEqual(manifest)
  })

  it('returns null for a wrong prefix', () => {
    expect(parseClientManifest('not-the-expected-prefix')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseClientManifest(`${PREFIX}{not json};`)).toBeNull()
  })

  it('returns null when a route is missing its id', () => {
    const manifest = makeManifest()
    const routes: Record<string, Record<string, unknown>> = JSON.parse(JSON.stringify(manifest.routes))
    delete routes['root']!['id']
    expect(parseClientManifest(serializeManifest({ ...manifest, routes }))).toBeNull()
  })

  it('returns null when the entry shape is invalid', () => {
    expect(parseClientManifest(serializeManifest({ entry: {}, routes: {} }))).toBeNull()
  })
})

describe('shared/route-warmup/manifest — collectManifestChunks', () => {
  it("resolves 'entry' to the manifest entry (module + imports)", () => {
    expect(collectManifestChunks(makeManifest(), ['entry'])).toEqual(['/assets/entry.js', '/assets/runtime.js'])
  })

  it("resolves 'root' through the generic route path WITH client* extras", () => {
    // The writer previously skipped extras for 'root' — the drift case.
    expect(collectManifestChunks(makeManifest(), ['root'])).toEqual([
      '/assets/root.js',
      '/assets/runtime.js',
      '/assets/root-shared.js',
      '/assets/root-loader.js',
    ])
  })

  it('collects module, imports, and all four extras for ordinary routes', () => {
    expect(collectManifestChunks(makeManifest(), ['routes/public/home'])).toEqual([
      '/assets/home.js',
      '/assets/shared.js',
      '/assets/home-action.js',
      '/assets/home-loader.js',
      '/assets/home-middleware.js',
      '/assets/home-fallback.js',
    ])
  })

  it('skips unknown ids', () => {
    expect(collectManifestChunks(makeManifest(), ['routes/does/not/exist', 'entry'])).toEqual([
      '/assets/entry.js',
      '/assets/runtime.js',
    ])
  })

  it('dedupes chunks in insertion order', () => {
    // '/assets/runtime.js' appears in both the entry imports and root imports.
    expect(collectManifestChunks(makeManifest(), ['entry', 'root'])).toEqual([
      '/assets/entry.js',
      '/assets/runtime.js',
      '/assets/root.js',
      '/assets/root-shared.js',
      '/assets/root-loader.js',
    ])
  })

  it('applies exclusion patterns against the chunk basename only', () => {
    const manifest = makeManifest()
    // Matches the basename 'canvas-hl.js' → excluded.
    manifest.routes['root']!.imports.push('/assets/canvas-hl.js')
    expect(collectManifestChunks(manifest, ['root'], [/^canvas-/])).toEqual([
      '/assets/root.js',
      '/assets/runtime.js',
      '/assets/root-shared.js',
      '/assets/root-loader.js',
    ])
    // Would match the '/assets/' path segment but never a basename → kept.
    expect(collectManifestChunks(makeManifest(), ['entry'], [/^assets/])).toEqual([
      '/assets/entry.js',
      '/assets/runtime.js',
    ])
  })
})

describe('shared/route-warmup/manifest — isWarmupManifest', () => {
  it('accepts the shape the writer emits', () => {
    expect(
      isWarmupManifest({
        version: 1,
        tier1: ['/assets/root.js'],
        tier2_public: [],
        tier2_admin: ['/assets/dashboard.js'],
        tier2_editor: [],
        tier2_auth: [],
      }),
    ).toBe(true)
  })

  it('rejects non-record values', () => {
    expect(isWarmupManifest(null)).toBe(false)
    expect(isWarmupManifest('warmup-manifest')).toBe(false)
  })

  it('rejects a missing tier field', () => {
    expect(
      isWarmupManifest({
        version: 1,
        tier1: [],
        tier2_public: [],
        tier2_admin: [],
        tier2_editor: [],
      }),
    ).toBe(false)
  })

  it('rejects a non-string-array tier field', () => {
    expect(
      isWarmupManifest({
        version: 1,
        tier1: ['/ok', 42],
        tier2_public: [],
        tier2_admin: [],
        tier2_editor: [],
        tier2_auth: [],
      }),
    ).toBe(false)
  })

  it('rejects a non-number version', () => {
    expect(
      isWarmupManifest({
        version: '1',
        tier1: [],
        tier2_public: [],
        tier2_admin: [],
        tier2_editor: [],
        tier2_auth: [],
      }),
    ).toBe(false)
  })
})
