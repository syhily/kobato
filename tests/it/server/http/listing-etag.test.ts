import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlogSettingsBundle } from '@/shared/config/types'
import type { AppLocalization } from '@/shared/i18n/app-localization'
import type { LexicalEditorState } from '@/shared/lexical/schema'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { lexicalBodyWith, lexicalParagraph } from '#/_helpers/lexical'
import { makePublicCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postTable } from '@/server/infra/db/schema/post'
import { postTag } from '@/server/infra/db/schema/post-tag'
import { category as categoryTable, tag as tagTable } from '@/server/infra/db/schema/taxonomy'
import { __resetRateLimitsForTests } from '@/server/infra/rate-limit'
import { representationRevisionsFor } from '@/shared/config/representation-scopes'

// Listing-document revalidation through the real oRPC path: the tag fingerprints the COMPLETE
// payload (page slice + counters, SEO, sidebar/extra, archives/categories) plus locale/time
// zone/format, the LISTING generation, the site calendar day and APP_VERSION. Only an identical
// representation may answer not-modified, and a 304 never records a view.

const analytics = vi.hoisted(() => ({ trackPageView: vi.fn() }))

vi.mock('@/server/domains/analytics/track', () => ({
  trackPageView: analytics.trackPageView,
  flushTrackedEvents: vi.fn(async () => undefined),
}))

const db = getTestDb()

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-08T04:00:00.000Z')) // 12:00 Asia/Shanghai
  await clearAllTables(db)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  __resetRateLimitsForTests()
  analytics.trackPageView.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

const LOCALIZATION: AppLocalization = {
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  timeFormat: 'yyyy-MM-dd',
  revision: 'test-boot:process-identity',
  revisions: representationRevisionsFor(TEST_BLOG_SETTINGS_BUNDLE),
}

const body: LexicalEditorState = lexicalBodyWith([lexicalParagraph('Listing body.')])

async function seedPost(
  opts: Partial<typeof postTable.$inferInsert> & { body?: LexicalEditorState } = {},
): Promise<number> {
  const { body: postBody, ...meta } = opts
  const rows = await db
    .insert(postTable)
    .values({
      slug: meta.slug ?? `post-${Math.random().toString(36).slice(2)}`,
      title: meta.title ?? 'Listing post',
      summary: meta.summary ?? 'react summary',
      published: meta.published ?? true,
      publishedAt: meta.publishedAt ?? new Date('2026-01-01'),
      firstPublishedAt: meta.firstPublishedAt ?? new Date('2026-01-01'),
      visible: meta.visible ?? true,
      ...meta,
    })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  const revisions = await db
    .insert(contentTable)
    .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: postBody ?? body })
    .returning({ id: contentTable.id })
  await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
  return postId
}

async function seedCategory(name: string, slug: string): Promise<number> {
  const rows = await db.insert(categoryTable).values({ name, slug, cover: '' }).returning({ id: categoryTable.id })
  return rows[0]!.id
}

async function seedTag(name: string, slug: string): Promise<number> {
  const rows = await db.insert(tagTable).values({ name, slug }).returning({ id: tagTable.id })
  return rows[0]!.id
}

type OkListing = {
  kind: string
  etag: string
  listing: { pageNum: number; totalPage: number; resolvedPosts: { slug: string }[] }
}
type NotModified = { kind: string; etag: string }

async function read<T>(
  path: string,
  input: unknown,
  localization: AppLocalization = LOCALIZATION,
  settings?: BlogSettingsBundle | null,
): Promise<T> {
  const res = await callRpc(
    path,
    input,
    makePublicCtx({ db, localization, ...(settings === undefined ? {} : { settings }) }),
  )
  return parseRpcJson<T>(res)
}

function withPageSize(scope: 'posts' | 'search', size: number): BlogSettingsBundle {
  const content = TEST_BLOG_SETTINGS_BUNDLE.content!
  return {
    ...TEST_BLOG_SETTINGS_BUNDLE,
    content: { ...content, pagination: { ...content.pagination, [scope]: size } },
  }
}

function changedListingRevision(): AppLocalization {
  return {
    ...LOCALIZATION,
    revisions: { ...LOCALIZATION.revisions, listing: 'listing-generation-other' },
  }
}

describe('listing representation ETags — same representation', () => {
  it('home page 1 answers not-modified on a repeat request', async () => {
    await seedPost({ slug: 'one' })
    await seedPost({ slug: 'two' })

    const first = await read<OkListing>('/content/home', {})
    expect(first.kind).toBe('ok')
    const repeated = await read<NotModified>('/content/home', { ifNoneMatch: first.etag })
    expect(repeated.kind).toBe('not-modified')
    expect(repeated.etag).toBe(first.etag)
  })

  it('home page 2 answers not-modified on a repeat request', async () => {
    for (let i = 0; i < 10; i++) {
      await seedPost({ slug: `p-${i}`, firstPublishedAt: new Date(Date.UTC(2026, 0, i + 1)) })
    }

    const first = await read<OkListing>('/content/home', { num: '2' })
    expect(first.kind).toBe('ok')
    expect(first.listing.pageNum).toBe(2)
    expect((await read<NotModified>('/content/home', { num: '2', ifNoneMatch: first.etag })).kind).toBe('not-modified')
  })

  it('search answers not-modified on a repeat request', async () => {
    await seedPost({ slug: 'searchable', title: 'react notes' })

    const first = await read<OkListing>('/content/search', { keyword: 'react' })
    expect(first.kind).toBe('ok')
    expect((await read<NotModified>('/content/search', { keyword: 'react', ifNoneMatch: first.etag })).kind).toBe(
      'not-modified',
    )
  })

  it('category and tag listings answer not-modified on a repeat request', async () => {
    const categoryId = await seedCategory('general', 'general')
    const tagId = await seedTag('typescript', 'typescript')
    const postId = await seedPost({ slug: 'tagged', categoryId })
    await db.insert(postTag).values({ postId, tagId })

    const category = await read<OkListing>('/content/posts/list', {
      scope: { type: 'category', slug: 'general' },
    })
    expect(category.kind).toBe('ok')
    expect(
      (
        await read<NotModified>('/content/posts/list', {
          scope: { type: 'category', slug: 'general' },
          ifNoneMatch: category.etag,
        })
      ).kind,
    ).toBe('not-modified')

    const tag = await read<OkListing>('/content/posts/list', { scope: { type: 'tag', slug: 'typescript' } })
    expect(tag.kind).toBe('ok')
    expect(
      (
        await read<NotModified>('/content/posts/list', {
          scope: { type: 'tag', slug: 'typescript' },
          ifNoneMatch: tag.etag,
        })
      ).kind,
    ).toBe('not-modified')
  })

  it('archives answers not-modified on a repeat request', async () => {
    await seedPost({ slug: 'archived' })

    const first = await read<{ kind: string; etag: string }>('/content/archives', {})
    expect(first.kind).toBe('ok')
    expect((await read<NotModified>('/content/archives', { ifNoneMatch: first.etag })).kind).toBe('not-modified')
  })

  it('categories list answers not-modified on a repeat request', async () => {
    await seedCategory('general', 'general')

    const first = await read<{ kind: string; etag: string }>('/content/categories/list', {})
    expect(first.kind).toBe('ok')
    expect((await read<NotModified>('/content/categories/list', { ifNoneMatch: first.etag })).kind).toBe('not-modified')
  })
})

describe('listing representation ETags — a changed representation is 200', () => {
  it('a new visible post invalidates the old home tag', async () => {
    await seedPost({ slug: 'first' })
    const base = await read<OkListing>('/content/home', {})

    await seedPost({ slug: 'second', firstPublishedAt: new Date('2026-02-01') })
    const after = await read<OkListing>('/content/home', { ifNoneMatch: base.etag })

    expect(after.kind).toBe('ok')
    expect(after.etag).not.toBe(base.etag)
  })

  it('a locale change invalidates the old listing tag', async () => {
    await seedPost({ slug: 'first' })
    const base = await read<OkListing>('/content/home', {})

    const after = await read<OkListing>(
      '/content/home',
      { ifNoneMatch: base.etag },
      { ...LOCALIZATION, locale: 'en-US' },
    )
    expect(after.kind).toBe('ok')
    expect(after.etag).not.toBe(base.etag)
  })

  it('a listing-generation change invalidates the old tag', async () => {
    await seedPost({ slug: 'first' })
    const base = await read<OkListing>('/content/home', {})

    const after = await read<OkListing>('/content/home', { ifNoneMatch: base.etag }, changedListingRevision())
    expect(after.kind).toBe('ok')
    expect(after.etag).not.toBe(base.etag)
  })

  it('a category rename invalidates the old category tag', async () => {
    const categoryId = await seedCategory('general', 'general')
    await seedPost({ slug: 'tagged', categoryId })
    const base = await read<OkListing>('/content/posts/list', { scope: { type: 'category', slug: 'general' } })

    await db.update(categoryTable).set({ name: 'renamed' }).where(eq(categoryTable.id, categoryId))
    const after = await read<OkListing>('/content/posts/list', {
      scope: { type: 'category', slug: 'general' },
      ifNoneMatch: base.etag,
    })

    expect(after.kind).toBe('ok')
    expect(after.etag).not.toBe(base.etag)
  })
})

describe('listing representation ETags — site midnight and pinned settings', () => {
  it('rotates exactly at the site-zone midnight (body and tag stay in step)', async () => {
    await seedPost({ slug: 'one' })

    vi.setSystemTime(new Date('2026-11-08T15:59:59.000Z')) // 23:59:59 Asia/Shanghai
    const before = await read<OkListing>('/content/home', {})

    vi.setSystemTime(new Date('2026-11-08T16:00:01.000Z')) // 00:00:01, next site day
    const after = await read<OkListing>('/content/home', { ifNoneMatch: before.etag })

    expect(after.kind).toBe('ok')
    expect(after.etag).not.toBe(before.etag)
  })

  it('search takes its page size from the pinned settings capture', async () => {
    for (let i = 0; i < 8; i++) {
      await seedPost({ slug: `search-${i}`, title: 'react notes' })
    }

    // Global search page size is 7 → 2 pages; the pinned capture says 3 → 3 pages.
    const json = await read<OkListing>('/content/search', { keyword: 'react' }, LOCALIZATION, withPageSize('search', 3))
    expect(json.listing.totalPage).toBe(3)
  })

  it('scoped listings take their page size from the pinned settings capture', async () => {
    const categoryId = await seedCategory('general', 'general')
    for (let i = 0; i < 13; i++) {
      await seedPost({
        slug: `cat-${i}`,
        categoryId,
        firstPublishedAt: new Date(Date.UTC(2026, 0, i + 1)),
      })
    }

    // Global posts page size is 6 → 3 pages; the pinned capture says 4 → 4 pages.
    const json = await read<OkListing>(
      '/content/posts/list',
      { scope: { type: 'category', slug: 'general' } },
      LOCALIZATION,
      withPageSize('posts', 4),
    )
    expect(json.listing.totalPage).toBe(4)
  })
})

describe('listing representation ETags — redirects and page views', () => {
  it('keeps the pagination redirect even when a matching tag is carried', async () => {
    await seedPost({ slug: 'only' })
    const base = await read<OkListing>('/content/home', {})

    const overflow = await read<{ kind: string; status: number }>('/content/home', {
      num: '9999',
      ifNoneMatch: base.etag,
    })
    expect(overflow).toMatchObject({ kind: 'redirect', status: 302 })
  })

  it('does not record a page view for a 304, but does for a served listing', async () => {
    await seedPost({ slug: 'first' })

    const first = await read<OkListing>('/content/home', {})
    expect(analytics.trackPageView).toHaveBeenCalledTimes(1)

    const repeated = await read<NotModified>('/content/home', { ifNoneMatch: first.etag })
    expect(repeated.kind).toBe('not-modified')
    expect(analytics.trackPageView).toHaveBeenCalledTimes(1)

    // A changed representation is served again → one more view.
    await seedPost({ slug: 'second', firstPublishedAt: new Date('2026-02-01') })
    await read<OkListing>('/content/home', { ifNoneMatch: first.etag })
    expect(analytics.trackPageView).toHaveBeenCalledTimes(2)
  })
})
