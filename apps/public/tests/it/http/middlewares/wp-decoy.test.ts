import { makeLoaderArgs, unwrapLoaderData } from '#/_helpers/context'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { regularSession } from '#/_helpers/session'

import { content as contentTable } from '@kobato/server/infra/db/schema/content'
import { page as pageTable } from '@kobato/server/infra/db/schema/page'
import { isWordPressDecoyPath } from '@kobato/shared/http/wp-decoy'
import { EMPTY_LEXICAL_BODY } from '@kobato/shared/lexical/schema'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { frontendWpDecoyMiddleware } from '@/lib/http/wp-decoy'

// WordPress probe decoy contract. Two things under test:
//   1. `isWordPressDecoyPath` (now `@kobato/shared/http/wp-decoy` — the
//      single source both the core server and this headless frontend
//      mount) — pure predicate matching the patterns the project agreed
//      to intercept. The Hono wp-decoy middleware is the single
//      chokepoint that runs this predicate before any route loader and
//      answers hits with the canonical `404 Not WordPress`.
//   2. `routes/public/page/detail.tsx` — sanity check that real page slugs still
//      resolve through the page-detail loader (the middleware is what
//      handles probes; the loader never re-checks). Real engine: the page
//      is a seeded meta row + published content revision.

const db = getTestDb()
const session = regularSession()

// Presentational seam — the loader contract under test never renders.
vi.mock('@kobato/editor/lexical-html/LexicalBody', () => ({
  LexicalBody: () => null,
}))

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedPage(slug: string, title: string): Promise<number> {
  const rows = await db
    .insert(pageTable)
    .values({
      slug,
      title,
      published: true,
      publishedAt: new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
    })
    .returning({ id: pageTable.id })
  const pageId = rows[0]!.id
  const revisions = await db
    .insert(contentTable)
    .values({ type: 'page', ownerId: pageId, revisionNo: 1, status: 'published', body: EMPTY_LEXICAL_BODY })
    .returning({ id: contentTable.id })
  await db.update(pageTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(pageTable.id, pageId))
  return pageId
}

const pageDetailRoute = await import('@/routes/public/page/detail')

describe('isWordPressDecoyPath', () => {
  it('matches WordPress probe patterns', () => {
    const probes = [
      '/admin/options.php',
      '/admin/setup-config.php',
      '/wp-content/plugins/x.php',
      '/wp-content/uploads/img.jpg',
      '/wp-includes/wlwmanifest.xml',
      '/cgi-bin',
      '/cgi-bin/test.cgi',
      '/xmlrpc.php',
      '/index.php',
      '/blog/index.php',
    ]
    for (const path of probes) {
      expect(isWordPressDecoyPath(path), path).toBe(true)
    }
  })

  it('preserves the legitimate WordPress-style routes (login, install, SPA shell)', () => {
    expect(isWordPressDecoyPath('/admin/signin')).toBe(false)
    expect(isWordPressDecoyPath('/admin')).toBe(false)
    // The one-step install route. It ends in `.php` so without an
    // explicit allow list the decoy filter would happily 404 it.
    expect(isWordPressDecoyPath('/admin/setup')).toBe(false)
    // The admin SPA is mounted at `/admin/<page>` and `/admin/<page>/:id`;
    // it shares the WordPress URL shape on purpose so admins can keep their muscle
    // memory. Paths under that prefix that don't end in `.php` are SPA routes,
    // not scanner probes.
    expect(isWordPressDecoyPath('/admin/comments')).toBe(false)
    expect(isWordPressDecoyPath('/admin/security/users')).toBe(false)
    expect(isWordPressDecoyPath('/admin/security/users/12345')).toBe(false)
  })

  it('ignores unrelated paths', () => {
    const ordinary = [
      '/',
      '/posts/hello',
      '/about',
      '/cats/general',
      '/tags/typescript',
      '/search/foo',
      '/feed',
      '/sitemap.xml',
      '/cgi-binx',
      '/adminx',
    ]
    for (const path of ordinary) {
      expect(isWordPressDecoyPath(path), path).toBe(false)
    }
  })
})

describe('frontend decoy middleware (headless perimeter)', () => {
  function makeFrontendApp() {
    const app = new Hono()
    app.use(frontendWpDecoyMiddleware)
    // A stand-in for the React Router handler mounted after the decoy.
    app.get('*', (c) => c.text('ssr-handler'))
    return app
  }

  it('answers probes with the canonical 404 + Not WordPress body', async () => {
    const app = makeFrontendApp()

    for (const path of [
      '/wp-login.php',
      '/wp-content/plugins/x.php',
      '/wp-includes/wlwmanifest.xml',
      '/xmlrpc.php',
      '/cgi-bin/test.cgi',
    ]) {
      const res = await app.request(path)
      expect(res.status, path).toBe(404)
      // Hono's `c.text` drops the `statusText` init (same on core — the
      // marker survives in the BODY, which is what the client sees).
      expect(await res.text(), path).toBe('Not WordPress')
    }
  })

  it('lets legitimate WordPress-shaped routes reach the router', async () => {
    const app = makeFrontendApp()

    const res = await app.request('/admin/signin')

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ssr-handler')
  })

  it('lets ordinary public paths reach the router', async () => {
    const app = makeFrontendApp()

    const res = await app.request('/')

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ssr-handler')
  })
})

describe('routes/page.detail loader (probe interception lives in the middleware)', () => {
  it('still serves real page slugs', async () => {
    await seedPage('about', 'About')

    const data = unwrapLoaderData<{ page: { permalink: string } }>(
      await pageDetailRoute.loader(
        makeLoaderArgs({
          request: new Request('http://localhost/about'),
          session,
          db,
          params: { slug: 'about' },
        }),
      ),
    )
    expect(data.page.permalink).toBe('/about')
  })
})
