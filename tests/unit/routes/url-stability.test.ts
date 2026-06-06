import { describe, expect, it } from 'vitest'

import routes from '@/routes'

// External URL contract. AGENTS.md is explicit: "public URL / feed URL /
// stable". A regression here is potentially user-visible (broken bookmarks,
// search engine deindex, RSS reader churn). This file pins every public
// route in the manifest so any rename forces an explicit test update.

interface RouteEntry {
  path?: string
  file: string
  id?: string
  index?: boolean
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

describe('contract: public URL stability', () => {
  const all = flatten(routes)

  it('home + paginated home are mounted at / and /page/:num', () => {
    const home = all.find((r) => r.file === 'routes/public/home.tsx' && r.id === undefined)
    const homePaged = all.find((r) => r.id === 'home-page')
    expect(home).toBeDefined()
    expect(homePaged?.path).toBe('page/:num')
  })

  it('category + tag listings keep their /cats and /tags prefixes', () => {
    const paths = new Set(all.map((r) => r.path))
    for (const expected of ['cats/:slug', 'cats/:slug/page/:num', 'tags/:slug', 'tags/:slug/page/:num']) {
      expect(paths.has(expected), `missing public URL: /${expected}`).toBe(true)
    }
  })

  it('RSS / Atom / sitemap routes are mounted by Hono at the historical paths', () => {
    // Feed and sitemap routes migrated from React Router resource routes
    // to Hono native routes in server/http/resources/. The public URLs
    // remain stable; they are just no longer in the RR manifest.
    const paths = new Set(all.map((r) => r.path))
    expect(paths.has('feed')).toBe(false)
    expect(paths.has('feed/atom')).toBe(false)
    expect(paths.has('sitemap.xml')).toBe(false)
  })

  it('image endpoints (/images/og /calendar /avatar) preserve their URL shape', () => {
    // Image resource routes migrated to Hono — see server.ts and
    // server/http/resources/images.ts. Public URLs remain stable.
    const paths = new Set(all.map((r) => r.path))
    expect(paths.has('images/og/:slug.png')).toBe(false)
    expect(paths.has('images/calendar/:year/:time.png')).toBe(false)
    expect(paths.has('images/avatar/:hash.png')).toBe(false)
  })

  it('admin URLs are mounted (signin + dashboard + setup)', () => {
    const paths = new Set(all.map((r) => r.path))
    expect(paths.has('admin/signin')).toBe(true)
    expect(paths.has('admin')).toBe(true)
    expect(paths.has('admin/setup')).toBe(true)
  })

  it('post + page detail pages still match /posts/:slug and /:slug', () => {
    const paths = all.map((r) => r.path)
    expect(paths).toContain('posts/:slug')
    expect(paths).toContain(':slug')
  })

  it('search routes (/search, /search/:keyword, paged) are unchanged', () => {
    const paths = new Set(all.map((r) => r.path))
    // /search 301 redirect is served by Hono redirectsRouter; client-side
    // forms in Search.tsx intercept the submit and navigate directly to
    // /search/:keyword so /search never needs a React Router route entry.
    expect(paths.has('search')).toBe(false)
    expect(paths.has('search/:keyword')).toBe(true)
    expect(paths.has('search/:keyword/page/:num')).toBe(true)
  })

  it('the splat catch-all is mounted on routes/public/not-found.tsx', () => {
    const splat = all.find((r) => r.path === '*')
    expect(splat?.file).toBe('routes/public/not-found.tsx')
  })
})
