import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeLoaderArgs, unwrapLoaderData } from '#/_helpers/context'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { regularSession } from '#/_helpers/session'
import { isWordPressDecoyPath } from '@/server/http/middlewares/wp-decoy'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { page as pageTable } from '@/server/infra/db/schema/page'

// WordPress probe decoy: `isWordPressDecoyPath` predicate + a sanity check that
// real page slugs still resolve through the page-detail loader.

const db = getTestDb()
const session = regularSession()

// Presentational seam — the loader contract under test never renders.
vi.mock('@/ui/pt/render', () => ({
  PortableTextBody: () => null,
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
    .values({ type: 'page', ownerId: pageId, revisionNo: 1, status: 'published', body: [] })
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
    // `/admin/setup` ends in `.php` — an explicit allow list keeps it from being decoyed.
    expect(isWordPressDecoyPath('/admin/setup')).toBe(false)
    // Non-`.php` paths under `/admin/*` are SPA routes, not scanner probes.
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
