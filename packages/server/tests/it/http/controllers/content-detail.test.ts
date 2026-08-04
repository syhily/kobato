import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { seedMetric } from '#/_helpers/db'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makePublicCtx } from '#/_helpers/mock-ctx'

import { mintPreviewToken } from '@kobato/server/domains/preview-token/service'
import { contentPublicRouter } from '@kobato/server/http/controllers/content-public.controller'
import { content } from '@kobato/server/infra/db/schema/content'
import { metric } from '@kobato/server/infra/db/schema/metric'
import { page as pageTable } from '@kobato/server/infra/db/schema/page'
import { post as postTable } from '@kobato/server/infra/db/schema/post'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

async function seedPost(opts: { slug: string; title?: string; alias?: string[] }): Promise<number> {
  const rows = await db
    .insert(postTable)
    .values({
      slug: opts.slug,
      title: opts.title ?? opts.slug,
      published: true,
      publishedAt: new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
      deletedAt: null,
      visible: true,
      ...(opts.alias ? { alias: opts.alias } : {}),
    })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  const revision = await db
    .insert(content)
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: content.id })
  await db.update(postTable).set({ publishedRevisionId: revision[0]!.id }).where(eq(postTable.id, postId))
  await db.insert(metric).values(seedMetric({ type: 'post', ownerId: postId }))
  return postId
}

/** An UNPUBLISHED post with only a draft revision — visible via preview token only. */
async function seedDraftPost(slug: string): Promise<void> {
  const rows = await db
    .insert(postTable)
    .values({ slug, title: slug, published: false, visible: false })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  await db.insert(content).values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'draft', body: [] })
  await db.insert(metric).values(seedMetric({ type: 'post', ownerId: postId }))
}

/** An UNPUBLISHED page with only a draft revision — admin preview token only. */
async function seedDraftPage(slug: string): Promise<void> {
  const rows = await db
    .insert(pageTable)
    .values({ slug, title: slug, published: false })
    .returning({ id: pageTable.id })
  const pageId = rows[0]!.id
  await db.insert(content).values({ type: 'page', ownerId: pageId, revisionNo: 1, status: 'draft', body: [] })
  await db.insert(metric).values(seedMetric({ type: 'page', ownerId: pageId }))
}

describe('public content API — post detail', () => {
  it('returns the page-assembly data for a live post', async () => {
    await seedPost({ slug: 'hello', title: 'Hello World' })

    const result = await call(contentPublicRouter.postDetail, { slug: 'hello' }, { context: makePublicCtx({ db }) })
    expect(result.post.slug).toBe('hello')
    expect(result.canonicalSlug).toBeNull()
    expect(result.detail.commentKey).toBeTruthy()
  })

  it('answers NOT_FOUND for an unknown slug', async () => {
    await expect(
      call(contentPublicRouter.postDetail, { slug: 'nope' }, { context: makePublicCtx({ db }) }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('marks alias hits with the canonical slug (frontend replays the 301)', async () => {
    await seedPost({ slug: 'canonical', alias: ['old-alias'] })
    const result = await call(contentPublicRouter.postDetail, { slug: 'old-alias' }, { context: makePublicCtx({ db }) })
    expect(result.canonicalSlug).toBe('canonical')
  })
})

describe('public content API — draft preview via preview token (plan 0.5 §5)', () => {
  it('opens an unpublished post draft with an author token', async () => {
    await seedDraftPost('draft-post')

    const result = await call(
      contentPublicRouter.postDetail,
      { slug: 'draft-post', previewToken: mintPreviewToken('author') },
      { context: makePublicCtx({ db }) },
    )
    expect(result.draftMarker).toBe('draft')
    expect(result.post.slug).toBe('draft-post')
  })

  it('keeps the draft invisible to anonymous callers (no token)', async () => {
    await seedDraftPost('draft-post')
    await expect(
      call(contentPublicRouter.postDetail, { slug: 'draft-post' }, { context: makePublicCtx({ db }) }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects a tampered / expired token', async () => {
    await seedDraftPost('draft-post')
    await expect(
      call(
        contentPublicRouter.postDetail,
        { slug: 'draft-post', previewToken: `${mintPreviewToken('author')}x` },
        { context: makePublicCtx({ db }) },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    vi.useFakeTimers()
    try {
      const expired = mintPreviewToken('author')
      vi.setSystemTime(Date.now() + 40 * 60 * 1000)
      await expect(
        call(
          contentPublicRouter.postDetail,
          { slug: 'draft-post', previewToken: expired },
          { context: makePublicCtx({ db }) },
        ),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('opens a page draft ONLY with an admin token (author token rejected)', async () => {
    await seedDraftPage('draft-page')

    await expect(
      call(
        contentPublicRouter.pageDetail,
        { slug: 'draft-page', wantsDraftPreview: true, previewToken: mintPreviewToken('author') },
        { context: makePublicCtx({ db }) },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    const result = await call(
      contentPublicRouter.pageDetail,
      { slug: 'draft-page', wantsDraftPreview: true, previewToken: mintPreviewToken('admin') },
      { context: makePublicCtx({ db }) },
    )
    const pageResult = result as Extract<typeof result, { draftMarker: unknown }>
    expect(pageResult.draftMarker).toBe('draft')
  })

  it('keeps the page draft invisible to anonymous callers (no token)', async () => {
    await seedDraftPage('draft-page')
    await expect(
      call(
        contentPublicRouter.pageDetail,
        { slug: 'draft-page', wantsDraftPreview: true },
        { context: makePublicCtx({ db }) },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('public content API — page detail', () => {
  it('returns the page-assembly data', async () => {
    const rows = await db
      .insert(pageTable)
      .values({
        slug: 'about',
        title: 'About',
        published: true,
        publishedAt: new Date('2024-01-01'),
        firstPublishedAt: new Date('2024-01-01'),
      })
      .returning({ id: pageTable.id })
    const pageId = rows[0]!.id
    const revision = await db
      .insert(content)
      .values({ type: 'page', ownerId: pageId, revisionNo: 1, status: 'published', body: [] })
      .returning({ id: content.id })
    await db.update(pageTable).set({ publishedRevisionId: revision[0]!.id }).where(eq(pageTable.id, pageId))
    await db.insert(metric).values(seedMetric({ type: 'page', ownerId: pageId }))

    const result = await call(contentPublicRouter.pageDetail, { slug: 'about' }, { context: makePublicCtx({ db }) })
    if ('redirectTo' in result) {
      throw new Error('expected page data, got redirect')
    }
    expect(result.page.slug).toBe('about')
    expect(result.footnotesSectionTitle).toBeTruthy()
  })

  it('replays a live-post slug collision as a redirect payload', async () => {
    await seedPost({ slug: 'collision' })
    const result = await call(contentPublicRouter.pageDetail, { slug: 'collision' }, { context: makePublicCtx({ db }) })
    expect('redirectTo' in result).toBe(true)
  })
})

describe('public content API — search', () => {
  it('returns the listing shape for a keyword', async () => {
    await seedPost({ slug: 'hello-world', title: 'Hello World Post' })
    const result = await call(contentPublicRouter.search, { keyword: 'hello' }, { context: makePublicCtx({ db }) })
    if ('redirectTo' in result) {
      throw new Error('expected search data, got redirect')
    }
    expect(Array.isArray(result.resolvedPosts)).toBe(true)
  })
})

describe('public content API — listing family', () => {
  it('returns the homepage listing shape', async () => {
    await seedPost({ slug: 'home-post', title: 'Home Post' })
    const result = await call(contentPublicRouter.home, {}, { context: makePublicCtx({ db }) })
    if ('redirectTo' in result) {
      throw new Error('expected home data, got redirect')
    }
    expect(Array.isArray(result.resolvedPosts)).toBe(true)
    expect(result.rootPath).toBe('/')
    expect(result.extra).toHaveProperty('featurePosts')
    // 0.5-3 contract: the RPC serializer round-trips `Date` natively —
    // card dates stay real `Date` objects for the renderers (which call
    // `formatShowDate(date, …)`, Date-typed) without any schema glue.
    if (result.resolvedPosts.length > 0) {
      expect(result.resolvedPosts[0].date).toBeInstanceOf(Date)
    }
  })

  it('answers NOT_FOUND for an unknown category / tag', async () => {
    await expect(
      call(contentPublicRouter.categoryList, { slug: 'nope' }, { context: makePublicCtx({ db }) }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      call(contentPublicRouter.tagList, { slug: 'nope' }, { context: makePublicCtx({ db }) }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('returns archives with metadata-enhanced cards', async () => {
    await seedPost({ slug: 'arch-post' })
    const result = await call(contentPublicRouter.archives, {}, { context: makePublicCtx({ db }) })
    expect(result.resolvedPosts.length).toBeGreaterThan(0)
    expect(result.resolvedPosts[0]).toHaveProperty('meta')
  })
})
