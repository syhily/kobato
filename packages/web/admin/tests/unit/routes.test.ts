import routes from '@kobato/web-admin/routes'
import { clientLoader as splatLoader } from '@kobato/web-admin/routes/not-found'
import { describe, expect, it } from 'vitest'

interface RouteEntry {
  path?: string
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

describe('contract: workspace URL surface', () => {
  const all = flatten(routes)

  it('mounts exactly the three workspace trees plus the not-found index/splat pair', () => {
    const trees = new Set(all.map((r) => r.file.split('/')[1]))
    expect([...trees].sort()).toEqual(['admin', 'auth', 'editor', 'not-found.tsx'])
  })

  it('admin URLs are mounted (signin + dashboard + setup)', () => {
    const paths = new Set(all.map((r) => r.path))
    expect(paths.has('admin/signin')).toBe(true)
    expect(paths.has('admin')).toBe(true)
    expect(paths.has('admin/setup')).toBe(true)
  })

  it('no public document URL remains: home, listings, and details are gone', () => {
    const paths = new Set(all.map((r) => r.path))
    for (const gone of [
      '',
      'page/:num',
      'archives',
      'categories',
      'cats/:slug',
      'tags/:slug',
      'search/:keyword',
      'posts/:slug',
      ':slug',
    ]) {
      expect(paths.has(gone), `former public URL /${gone} must not be mounted in kobato`).toBe(false)
    }
    expect(all.filter((r) => r.file.startsWith('routes/public/'))).toEqual([])
  })

  it('the not-found route owns the bare / and every unmatched URL — the last two entries, outside the three layout groups', () => {
    expect(routes[routes.length - 2]).toEqual({ file: 'routes/not-found.tsx', index: true })
    expect(routes[routes.length - 1]).toEqual({
      file: 'routes/not-found.tsx',
      path: '*',
      id: 'routes/not-found-splat',
    })
    for (const entry of routes.slice(0, -2)) {
      expect('children' in entry, `${entry.file} must sit inside a layout group`).toBe(true)
    }
  })

  it('RSS / Atom / sitemap routes stay mounted by Hono at the historical paths', () => {
    const paths = new Set(all.map((r) => r.path))
    expect(paths.has('feed')).toBe(false)
    expect(paths.has('feed/atom')).toBe(false)
    expect(paths.has('sitemap.xml')).toBe(false)
  })

  it('image endpoints (/images/og /calendar /avatar) stay mounted by Hono, not in the manifest', () => {
    const paths = new Set(all.map((r) => r.path))
    expect(paths.has('images/og/:slug.png')).toBe(false)
    expect(paths.has('images/calendar/:year/:time.png')).toBe(false)
    expect(paths.has('images/avatar/:hash.png')).toBe(false)
  })
})

describe('contract: the root splat', () => {
  it('answers 404 for the bare / document and every unmatched URL', () => {
    try {
      splatLoader()
      expect.unreachable('the splat loader must always throw')
    } catch (error) {
      expect(error).toBeInstanceOf(Response)
      expect((error as Response).status).toBe(404)
    }
  })
})
