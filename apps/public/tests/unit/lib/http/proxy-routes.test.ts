import { describe, expect, it } from 'vitest'

import { FEED_PATTERNS, URL_PROXY_ROUTES } from '@/lib/http/proxy-routes'

// ─── URL-endpoint proxy mount table vs core's resource surface ───
//
// Phase-2 contract: every URL-shaped resource core serves MUST be
// proxiable through the frontend (the canonical domain is the
// frontend's), and the frontend must not forward anything core does not
// own. This test pins the frontend table against the CORE-SIDE EXPECTED
// LIST below — a hardcoded mirror of core's actual mounts, so either
// side drifting (a core route added without a proxy entry, or a proxy
// entry for a path core does not serve) fails here.
//
// Source of truth for the list (re-verify when editing):
//   - feeds:            packages/server/src/http/resources/feed.ts (6 routes)
//   - sitemap:          packages/server/src/http/resources/sitemap.ts
//   - robots/manifest:  packages/server/src/http/resources/assets.ts
//   - brand assets:     packages/server/src/domains/assets/services/routes.ts
//                       (`ASSET_ROUTES`, 14 entries)
//   - og/calendar/avatar: packages/server/src/http/resources/images.ts
//   - storage:          packages/server/src/http/resources/local-storage.ts
//   - embedded fonts:   packages/server/src/http/resources/fonts-embedded.ts
//
// Wide patterns on the frontend side (e.g. `/images/og/*`) are
// intentional: the proxy only decides WHETHER to forward, core re-routes
// the untouched pathname. The expected list therefore uses the same wide
// shapes.

/** Core's resource surface, as seen through the proxy's wide patterns. */
const CORE_EXPECTED: readonly string[] = [
  // feed.ts — six feeds.
  '/feed',
  '/feed/atom',
  '/cats/:slug/feed',
  '/cats/:slug/feed/atom',
  '/tags/:slug/feed',
  '/tags/:slug/feed/atom',
  // sitemap.ts + assets.ts.
  '/sitemap.xml',
  '/robots.txt',
  '/manifest.webmanifest',
  // ASSET_ROUTES — 14 brand assets (route paths, not slots).
  '/favicon.svg',
  '/logo.svg',
  '/logo-dark.svg',
  '/logo-large.svg',
  '/logo-large-dark.svg',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/images/icon-192.png',
  '/images/icon-512.png',
  '/images/open-graph.png',
  '/images/blog-poster.png',
  '/images/blog-poster-dark.png',
  '/images/default-avatar.png',
  '/images/default-music-cover.png',
  // images.ts — OG / calendar / avatar.
  '/images/og/*',
  '/images/og/cats/*',
  '/images/calendar/:year/*',
  '/images/calendar/dark/:year/*',
  '/images/avatar/*',
  // local-storage.ts + fonts-embedded.ts.
  '/storage/*',
  '/fonts/embedded/*',
] as const

describe('URL_PROXY_ROUTES ↔ core resource mount parity', () => {
  it('covers every core-owned URL endpoint (frontend must proxy all of them)', () => {
    const missing = CORE_EXPECTED.filter((path) => !URL_PROXY_ROUTES.includes(path))
    expect(missing, `core serves these, the frontend table does not proxy them: ${missing.join(', ')}`).toEqual([])
  })

  it('forwards nothing core does not serve', () => {
    const extra = URL_PROXY_ROUTES.filter((path) => !CORE_EXPECTED.includes(path))
    expect(extra, `frontend proxies these, core does not serve them: ${extra.join(', ')}`).toEqual([])
  })

  it('has no duplicates in the mount table', () => {
    expect(new Set(URL_PROXY_ROUTES).size).toBe(URL_PROXY_ROUTES.length)
  })

  it('keeps the brand-asset count at exactly 14 (mirrors ASSET_ROUTES)', () => {
    const brandAssets = URL_PROXY_ROUTES.filter(
      (path) =>
        !path.includes(':') &&
        !path.includes('*') &&
        !path.startsWith('/feed') &&
        !path.startsWith('/sitemap') &&
        !path.startsWith('/robots') &&
        !path.startsWith('/manifest'),
    )
    expect(brandAssets).toHaveLength(14)
  })

  it('pins the cached feed/sitemap derivation (FEED_PATTERNS must stay 6 feed paths + /sitemap.xml)', () => {
    // FEED_PATTERNS is derived by suffix filter, so a feed-path rename
    // would silently shrink the cache surface — pin the derivation here.
    const feedInTable = URL_PROXY_ROUTES.filter((path) => path.endsWith('/feed') || path.endsWith('/feed/atom'))
    expect(FEED_PATTERNS).toHaveLength(6)
    expect(feedInTable).toHaveLength(6)
    expect(FEED_PATTERNS).toEqual(feedInTable)
    expect(feedInTable.every((p) => p.endsWith('/feed') || p.endsWith('/feed/atom'))).toBe(true)
    expect(URL_PROXY_ROUTES).toContain('/sitemap.xml')
  })
})
