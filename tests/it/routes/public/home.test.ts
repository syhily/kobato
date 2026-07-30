import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { makeLoaderArgs } from '#/_helpers/context'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { regularSession } from '#/_helpers/session'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postTable } from '@/server/infra/db/schema/post'
import { category as categoryTable, tag as tagTable } from '@/server/infra/db/schema/taxonomy'

// `home` loader is the SSR fan-out for `/` and `/page/:num`. The route is
// part of the public URL surface (`AGENTS.md`: "/" canonical, "/page/N"
// 30x to /N=1 etc.) so we pin its three observable contracts against the
// real engine (seeded posts, real pagination, real sidebar/taxonomy
// queries, real listing SEO):
//
//   1. /page/1 redirects to / (canonical collapse).
//   2. The 3-block payload (listing, sidebar, seo) is shaped correctly
//      for both the canonical / and the deep-paginated /page/N case.
//   3. Out-of-range pagination triggers a redirect to the last real page.

const db = getTestDb()
const session = regularSession()

beforeEach(async () => {
  await clearAllTables(db)
})

async function seedCategory(name: string, slug: string): Promise<number> {
  const rows = await db.insert(categoryTable).values({ name, slug, cover: '' }).returning({ id: categoryTable.id })
  return rows[0]!.id
}

async function seedTag(name: string, slug: string): Promise<number> {
  const rows = await db.insert(tagTable).values({ name, slug }).returning({ id: tagTable.id })
  return rows[0]!.id
}

// The home loader's tail-merge guard folds an orphan last page into its
// predecessor when the tail is strictly smaller than `pageSize - 2`. The
// test settings fixture pins `pagination.posts = 6`, so threshold = 4.
async function seedPost(opts: {
  slug: string
  title?: string
  categoryId?: number | null
  day?: number
}): Promise<number> {
  const date = new Date(Date.UTC(2024, 0, opts.day ?? 1))
  const rows = await db
    .insert(postTable)
    .values({
      slug: opts.slug,
      title: opts.title ?? opts.slug,
      published: true,
      publishedAt: date,
      firstPublishedAt: date,
      categoryId: opts.categoryId ?? null,
      visible: true,
    })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  const revisions = await db
    .insert(contentTable)
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: contentTable.id })
  await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
  return postId
}

/** Seed `count` live posts (slug prefix + index), newest first by day. */
async function seedCatalog(count: number, slugPrefix: string, categoryId?: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await seedPost({ slug: `${slugPrefix}-${i}`, categoryId: categoryId ?? null, day: i + 1 })
  }
}

const { loader } = await import('@/routes/public/home')

describe('routes/home loader', () => {
  it('/page/1 collapses to / (canonical) via 30x redirect', async () => {
    await expect(
      loader(
        makeLoaderArgs({
          request: new Request('http://localhost/page/1'),
          session,
          db,
          params: { num: '1' },
        }),
      ),
    ).rejects.toMatchObject({ status: 302 })
  })

  it('returns the unified listing payload (resolvedPosts, extra.sidebar, empty seo) on /', async () => {
    const categoryId = await seedCategory('general', 'general')
    await seedTag('typescript', 'typescript')
    // 10 posts at pageSize 6 fan out to 6 + 4. The tail-merge threshold is
    // `pageSize - 2 = 4` and the strict less-than check keeps a tail of
    // exactly 4 on its own page, so /page/2 renders instead of redirecting.
    await seedCatalog(10, 'post', categoryId)

    const result = await loader(
      makeLoaderArgs({
        request: new Request('http://localhost/'),
        session,
        db,
        params: {},
      }),
    )

    expect(result.pageNum).toBe(1)
    expect(result.seo).toEqual([])
    expect(result.totalPage).toBe(2)
    expect(result.resolvedPosts).toHaveLength(6)
    // Newest first (firstPublishedAt desc).
    expect(result.resolvedPosts[0]?.slug).toBe('post-9')
    expect(Object.keys(result.extra.categoryLinks)).toContain('general')
    expect(result.extra.categoryLinks.general).toBe('/cats/general')
    expect(result.extra.sidebar.recentComments).toEqual([])
  })

  it('returns the deep-paginated payload (with seo populated) on /page/N', async () => {
    await seedCatalog(10, 'post')

    const result = await loader(
      makeLoaderArgs({
        request: new Request('http://localhost/page/2'),
        session,
        db,
        params: { num: '2' },
      }),
    )

    expect(result.pageNum).toBe(2)
    // Page 2 renders the four-post tail (10 = 6 + 4).
    expect(result.resolvedPosts).toHaveLength(4)
    expect(Array.isArray(result.seo)).toBe(true)
    expect(result.seo.length).toBeGreaterThan(0)
    const canonical = result.seo.find(
      (tag) =>
        tag !== null &&
        typeof tag === 'object' &&
        'tagName' in tag &&
        tag.tagName === 'link' &&
        tag.rel === 'canonical',
    ) as { href: string } | undefined
    expect(canonical?.href).toContain('/page/2')
    const robots = result.seo.find(
      (tag) => tag !== null && typeof tag === 'object' && 'name' in tag && tag.name === 'robots',
    ) as { content: string } | undefined
    expect(robots?.content).toContain('noindex')
  })

  it('redirects /page/N to the last valid page when N overflows', async () => {
    await seedCatalog(10, 'post')

    await expect(
      loader(
        makeLoaderArgs({
          request: new Request('http://localhost/page/9999'),
          session,
          db,
          params: { num: '9999' },
        }),
      ),
    ).rejects.toMatchObject({ status: 302 })
  })
})

// Tail-merge guard. 7 posts at pageSize 6 naturally split 6 + 1; the
// threshold of 4 collapses the trailing single post into page 1.
describe('routes/home loader — tail-merge guard', () => {
  it('absorbs a 1-post tail into the previous page so /page/2 redirects to /', async () => {
    await seedCatalog(7, 'short')

    await expect(
      loader(
        makeLoaderArgs({
          request: new Request('http://localhost/page/2'),
          session,
          db,
          params: { num: '2' },
        }),
      ),
    ).rejects.toMatchObject({ status: 302 })
  })

  it('returns all posts on / when the merge collapses the full catalogue into one page', async () => {
    await seedCatalog(7, 'short')

    const result = await loader(
      makeLoaderArgs({
        request: new Request('http://localhost/'),
        session,
        db,
        params: {},
      }),
    )

    expect(result.totalPage).toBe(1)
    expect(result.pageNum).toBe(1)
    expect(result.resolvedPosts).toHaveLength(7)
  })
})
