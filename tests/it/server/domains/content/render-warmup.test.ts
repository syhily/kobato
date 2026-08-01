import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { saveBody } from '@/server/domains/content/lifecycle'
import { warmContentRenderCaches } from '@/server/domains/content/render-warmup'
import { pageLifecycleAdapter } from '@/server/domains/pages/services/lifecycle-adapter'
import { createPage } from '@/server/domains/pages/services/mutate'
import { postLifecycleAdapter } from '@/server/domains/posts/services/lifecycle-adapter'
import { createPost, updatePostMeta } from '@/server/domains/posts/services/mutate'
import { upsertAdminCategory } from '@/server/domains/taxonomies/categories/services/mutate'
import { kvCache } from '@/server/infra/db/schema/kv-cache'
import { page as pageMetaTable } from '@/server/infra/db/schema/page'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { drawOpenGraph } from '@/server/render/og/render'

// Renderers are stubbed to cheap buffers (canvas/font/quote work has its
// own suites); the warmup module is wrap-don't-replace so the REAL
// through() calls run against the real engine and fill the real buckets
// — the spy only pins WHICH mutations knock on the warm door.
vi.mock('@/server/render/og/render', () => ({
  drawOpenGraph: vi.fn(async () => Buffer.from('og-png')),
}))
vi.mock('@/server/render/calendar/render', () => ({
  renderCalendar: vi.fn(async () => Buffer.from('cal-png')),
}))
vi.mock('@/server/domains/content/render-warmup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/domains/content/render-warmup')>()
  return { ...actual, warmContentRenderCaches: vi.fn(actual.warmContentRenderCaches) }
})

const warmMock = vi.mocked(warmContentRenderCaches)
const drawOpenGraphMock = vi.mocked(drawOpenGraph)

// Side-effect import: wires the real render-layer implementation into the
// domain slot (with the stubbed renderers above).
import '@/server/render/warmup/content-cache'

const db = getTestDb()

const VALID_BODY = [
  { _type: 'block', _key: 'b1', style: 'normal', children: [{ _type: 'span', _key: 's1', text: 'hi', marks: [] }] },
]

beforeEach(async () => {
  await clearAllTables(db)
  vi.clearAllMocks()
  drawOpenGraphMock.mockImplementation(async () => Buffer.from('og-png'))
})

async function postIdBySlug(slug: string): Promise<number> {
  const rows = await db.select({ id: postMetaTable.id }).from(postMetaTable).where(eq(postMetaTable.slug, slug))
  return rows[0]!.id
}

async function pageIdBySlug(slug: string): Promise<number> {
  const rows = await db.select({ id: pageMetaTable.id }).from(pageMetaTable).where(eq(pageMetaTable.slug, slug))
  return rows[0]!.id
}

async function cachedBuckets(): Promise<string[]> {
  const rows = await db.select({ bucket: kvCache.bucket }).from(kvCache)
  return rows.map((row) => row.bucket)
}

describe('render cache warmup on content publish/update', () => {
  it('warms the OG + calendar buckets after a post publish', async () => {
    await createPost(db, { title: 'Hello World' }, null)
    const postId = await postIdBySlug('hello-world')

    const result = await saveBody(
      db,
      postLifecycleAdapter,
      { entityId: postId, body: VALID_BODY, authorId: null },
      'publish',
    )
    expect(result.status).toBe('saved')

    expect(warmMock).toHaveBeenCalledWith(db, {
      slug: 'hello-world',
      title: 'Hello World',
      summary: '',
      cover: '',
    })
    // The fire-and-forget warm fills the same buckets the crawler's first
    // scan reads — wait for the async write to land.
    await vi.waitFor(async () => {
      const buckets = await cachedBuckets()
      expect(buckets).toContain('og')
      expect(buckets).toContain('calendar')
    })
  })

  it('re-warms after a meta update on a live post, but not on an unpublished one', async () => {
    await createPost(db, { title: 'Live Post' }, null)
    const liveId = await postIdBySlug('live-post')
    await saveBody(db, postLifecycleAdapter, { entityId: liveId, body: VALID_BODY, authorId: null }, 'publish')
    await createPost(db, { title: 'Draft Post' }, null)
    const draftId = await postIdBySlug('draft-post')
    warmMock.mockClear()

    await updatePostMeta(db, { id: liveId, title: 'Live Post Renamed' })
    // The meta update re-derives the slug from the new title (no explicit
    // slug in the input) — the warm target carries the NEW slug.
    expect(warmMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ slug: 'live-post-renamed', title: 'Live Post Renamed' }),
    )

    warmMock.mockClear()
    await updatePostMeta(db, { id: draftId, title: 'Draft Post Renamed' })
    expect(warmMock).not.toHaveBeenCalled()
  })

  it('warms after a page publish with the site-description summary fallback', async () => {
    await createPage(db, { title: 'About' }, null)
    const pageId = await pageIdBySlug('about')

    const result = await saveBody(
      db,
      pageLifecycleAdapter,
      { entityId: pageId, body: VALID_BODY, authorId: null },
      'publish',
    )
    expect(result.status).toBe('saved')

    // The OG request path resolves an empty page summary to the site
    // description (the test fixture's '诗与梦想的远方') — the warm key
    // must fold the same inputs.
    expect(warmMock).toHaveBeenCalledWith(db, {
      slug: 'about',
      title: 'About',
      summary: '诗与梦想的远方',
      cover: '',
    })
  })

  it('a failed warm never reaches the publish path', async () => {
    drawOpenGraphMock.mockRejectedValue(new Error('render down'))
    await createPost(db, { title: 'Fragile Render' }, null)
    const postId = await postIdBySlug('fragile-render')

    const result = await saveBody(
      db,
      postLifecycleAdapter,
      { entityId: postId, body: VALID_BODY, authorId: null },
      'publish',
    )
    expect(result.status).toBe('saved')
    expect(warmMock).toHaveBeenCalled()
  })
})

describe('category OG warmup (audit P1-12)', () => {
  it('warms the category OG card after a category create', async () => {
    await upsertAdminCategory(db, { name: 'Tech Notes', cover: '', description: '' })

    // The OG route serves categories under a `cat-`-prefixed slug and
    // resolves an empty description to the site description (the test
    // fixture's '诗与梦想的远方') — the warm key must fold the same inputs.
    expect(warmMock).toHaveBeenCalledWith(db, {
      slug: 'cat-tech-notes',
      title: 'Tech Notes',
      summary: '诗与梦想的远方',
      cover: '',
    })
    // The fire-and-forget warm fills the same bucket the crawler's first
    // scan reads — wait for the async write to land.
    await vi.waitFor(async () => {
      expect(await cachedBuckets()).toContain('og')
    })
  })

  it('re-warms under the new content-hash key after a category rename', async () => {
    const created = await upsertAdminCategory(db, { name: 'Old Cat', cover: '', description: 'old summary' })
    warmMock.mockClear()

    await upsertAdminCategory(db, { id: Number(created.id), name: 'New Cat', cover: '', description: 'new summary' })

    expect(warmMock).toHaveBeenCalledWith(db, {
      slug: 'cat-new-cat',
      title: 'New Cat',
      summary: 'new summary',
      cover: '',
    })
  })
})
