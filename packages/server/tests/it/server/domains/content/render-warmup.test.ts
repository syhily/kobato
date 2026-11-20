import { page as pageMetaTable } from '@kobato/db/schema/page.ts'
import { post as postMetaTable } from '@kobato/db/schema/post.ts'
import { saveBody } from '@kobato/server/domains/content/lifecycle.ts'
import { warmContentRenderCaches } from '@kobato/server/domains/content/render-warmup.ts'
import { pageLifecycleAdapter } from '@kobato/server/domains/pages/services/lifecycle-adapter.ts'
import { createPage } from '@kobato/server/domains/pages/services/mutate.ts'
import { postLifecycleAdapter } from '@kobato/server/domains/posts/services/lifecycle-adapter.ts'
import { createPost, updatePostMeta } from '@kobato/server/domains/posts/services/mutate.ts'
import { upsertAdminCategory } from '@kobato/server/domains/taxonomies/categories/services/mutate.ts'
import { countEntryFiles } from '@kobato/server/infra/cache/file-store.ts'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { lexicalBodyWith, lexicalParagraph, stubMusicResolver } from '@kobato/server/tests/utils/lexical.ts'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const warmMock = vi.spyOn(await import('@kobato/server/domains/content/render-warmup.ts'), 'warmContentRenderCaches')
void warmContentRenderCaches

import '@kobato/server/render/warmup/content-cache.ts'

const db = getTestDb()

const VALID_BODY = lexicalBodyWith([lexicalParagraph('hi')])
const NO_MUSIC = stubMusicResolver()

const coverDataUri = `data:image/png;base64,${(
  await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 32, g: 64, b: 128 } } })
    .png()
    .toBuffer()
).toString('base64')}`

beforeEach(async () => {
  warmMock.mockClear()
  await clearAllTables(db)
})

async function postIdBySlug(slug: string): Promise<number> {
  const rows = await db.select({ id: postMetaTable.id }).from(postMetaTable).where(eq(postMetaTable.slug, slug))
  return rows[0]!.id
}

async function pageIdBySlug(slug: string): Promise<number> {
  const rows = await db.select({ id: pageMetaTable.id }).from(pageMetaTable).where(eq(pageMetaTable.slug, slug))
  return rows[0]!.id
}

async function bucketHasEntries(bucket: string): Promise<boolean> {
  return (await countEntryFiles(bucket)) > 0
}

describe('render cache warmup on content publish/update', () => {
  it('warms the OG + calendar buckets after a post publish', async () => {
    await createPost(db, { title: 'Hello World', cover: coverDataUri }, null)
    const postId = await postIdBySlug('hello-world')

    const result = await saveBody(
      db,
      postLifecycleAdapter,
      { entityId: postId, body: VALID_BODY, authorId: null, resolveMusicEmbeds: NO_MUSIC },
      'publish',
    )
    expect(result.status).toBe('saved')

    expect(warmMock.mock.calls.at(-1)?.[0]).toMatchObject({
      slug: 'hello-world',
      title: 'Hello World',
      summary: '',
      cover: coverDataUri,
    })
    await vi.waitFor(
      async () => {
        expect(await bucketHasEntries('og')).toBe(true)
        expect(await bucketHasEntries('calendar')).toBe(true)
      },
      { timeout: 8_000 },
    )
  })

  it('re-warms after a meta update on a live post, but not on an unpublished one', async () => {
    await createPost(db, { title: 'Live Post', cover: coverDataUri }, null)
    const liveId = await postIdBySlug('live-post')
    await saveBody(
      db,
      postLifecycleAdapter,
      { entityId: liveId, body: VALID_BODY, authorId: null, resolveMusicEmbeds: NO_MUSIC },
      'publish',
    )
    await createPost(db, { title: 'Draft Post' }, null)
    const draftId = await postIdBySlug('draft-post')
    warmMock.mockClear()

    await updatePostMeta(db, { id: liveId, title: 'Live Post Renamed' })
    expect(warmMock).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'live-post-renamed', title: 'Live Post Renamed' }),
    )

    warmMock.mockClear()
    await updatePostMeta(db, { id: draftId, title: 'Draft Post Renamed' })
    expect(warmMock).not.toHaveBeenCalled()
  })

  it('warms after a page publish with the site-description summary fallback', async () => {
    await createPage(db, { title: 'About', cover: coverDataUri }, null)
    const pageId = await pageIdBySlug('about')

    const result = await saveBody(
      db,
      pageLifecycleAdapter,
      { entityId: pageId, body: VALID_BODY, authorId: null, resolveMusicEmbeds: NO_MUSIC },
      'publish',
    )
    expect(result.status).toBe('saved')

    expect(warmMock.mock.calls.at(-1)?.[0]).toMatchObject({
      slug: 'about',
      title: 'About',
      summary: '诗与梦想的远方',
      cover: coverDataUri,
    })
  })

  it('a failed warm never reaches the publish path', async () => {
    await createPost(db, { title: 'Fragile Render', cover: 'ftp://example.com/broken.png' }, null)
    const postId = await postIdBySlug('fragile-render')

    const result = await saveBody(
      db,
      postLifecycleAdapter,
      { entityId: postId, body: VALID_BODY, authorId: null, resolveMusicEmbeds: NO_MUSIC },
      'publish',
    )
    expect(result.status).toBe('saved')
    expect(warmMock).toHaveBeenCalled()
  })
})

describe('category OG warmup', () => {
  it('warms the category OG card after a category create', async () => {
    await upsertAdminCategory(db, { name: 'Tech Notes', cover: coverDataUri, description: '' })

    expect(warmMock.mock.calls.at(-1)?.[0]).toMatchObject({
      slug: 'cat-tech-notes',
      title: 'Tech Notes',
      summary: '诗与梦想的远方',
      cover: coverDataUri,
    })
    await vi.waitFor(
      async () => {
        expect(await bucketHasEntries('og')).toBe(true)
      },
      { timeout: 8_000 },
    )
  })

  it('re-warms under the new content-hash key after a category rename', async () => {
    const created = await upsertAdminCategory(db, { name: 'Old Cat', cover: coverDataUri, description: 'old summary' })
    warmMock.mockClear()

    await upsertAdminCategory(db, {
      id: Number(created.id),
      name: 'New Cat',
      cover: coverDataUri,
      description: 'new summary',
    })

    expect(warmMock.mock.calls.at(-1)?.[0]).toMatchObject({
      slug: 'cat-new-cat',
      title: 'New Cat',
      summary: 'new summary',
      cover: coverDataUri,
    })
  })
})
