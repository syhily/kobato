import { sqliteOf } from '@kobato/db/sqlite/database'
import { content as contentTable } from '@kobato/db/sqlite/schema/content'
import { page as pageTable } from '@kobato/db/sqlite/schema/page'
import { post as postTable } from '@kobato/db/sqlite/schema/post'
import '@kobato/server/render/og/render'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makePublicCtx } from '@kobato/server/tests/utils/mock-ctx'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = getTestDb()

const drawSpy = vi.spyOn(await import('@kobato/server/render/og/render'), 'drawOpenGraph')

const coverDataUri = `data:image/png;base64,${(
  await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 32, g: 64, b: 128 } } })
    .png()
    .toBuffer()
).toString('base64')}`

beforeEach(async () => {
  drawSpy.mockClear()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  await clearAllTables(db)
})

async function seedPost(opts: {
  slug: string
  title?: string
  summary?: string
  published?: boolean
  publishedAt?: Date
  withRevision?: boolean
}): Promise<number> {
  const rows = await sqliteOf(db)
    .insert(postTable)
    .values({
      slug: opts.slug,
      title: opts.title ?? opts.slug,
      summary: opts.summary ?? '',
      cover: coverDataUri,
      published: opts.published ?? true,
      publishedAt: opts.publishedAt ?? new Date('2020-01-01'),
      firstPublishedAt: new Date('2020-01-01'),
      visible: true,
    })
    .returning({ id: postTable.id })
  const postId = rows[0]!.id
  if (opts.withRevision ?? true) {
    const revisions = await sqliteOf(db)
      .insert(contentTable)
      .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: [] })
      .returning({ id: contentTable.id })
    await sqliteOf(db).update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
  }
  return postId
}

async function seedPage(opts: { slug: string; title?: string; publishedAt?: Date }): Promise<number> {
  const rows = await sqliteOf(db)
    .insert(pageTable)
    .values({
      slug: opts.slug,
      title: opts.title ?? opts.slug,
      cover: coverDataUri,
      published: true,
      publishedAt: opts.publishedAt ?? new Date('2020-01-01'),
      firstPublishedAt: new Date('2020-01-01'),
    })
    .returning({ id: pageTable.id })
  const pageId = rows[0]!.id
  const revisions = await sqliteOf(db)
    .insert(contentTable)
    .values({ type: 'page', ownerId: pageId, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: contentTable.id })
  await sqliteOf(db).update(pageTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(pageTable.id, pageId))
  return pageId
}

const { imageRouter } = await import('@kobato/server/http/controllers/public/image.controller')

async function requestOg(slug: string) {
  return call(imageRouter.og, { slug }, { context: makePublicCtx({ db }) })
}

async function ogBytes(answer: { kind: string; body?: Blob }): Promise<Uint8Array | null> {
  if (answer.kind !== 'ok' || !(answer.body instanceof Blob)) {
    return null
  }
  return new Uint8Array(await answer.body.arrayBuffer())
}

describe('OG image slug resolution', () => {
  it('answers an ok PNG when slug matches a public post', async () => {
    await seedPost({ slug: 'hello', title: 'Hello', summary: 'World' })

    const bytes = await ogBytes(await requestOg('hello'))
    expect(bytes).not.toBeNull()
    expect(Array.from(bytes!.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(drawSpy.mock.calls[0]?.[0]).toMatchObject({ title: 'Hello' })
  })

  it('answers an ok PNG when slug matches a public page', async () => {
    await seedPage({ slug: 'about', title: 'About' })

    const bytes = await ogBytes(await requestOg('about'))
    expect(bytes).not.toBeNull()
    expect(Array.from(bytes!.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(drawSpy.mock.calls[0]?.[0]).toMatchObject({ title: 'About' })
  })

  it('falls back when slug matches neither post nor page', async () => {
    const answer = await requestOg('nonexistent')
    expect(answer.kind).toBe('redirect')
    expect(drawSpy).not.toHaveBeenCalled()
  })

  it('falls back when post is not public', async () => {
    await seedPost({ slug: 'draft-post', published: false, withRevision: false })

    expect((await requestOg('draft-post')).kind).toBe('redirect')
  })

  it('falls back when page is scheduled (publishedAt in the future)', async () => {
    await seedPage({ slug: 'scheduled-page', publishedAt: new Date('2099-01-01') })

    expect((await requestOg('scheduled-page')).kind).toBe('redirect')
  })

  it('uses post data when both post and page match (post wins)', async () => {
    await seedPost({ slug: 'collision', title: 'Hello', summary: 'World' })
    await seedPage({ slug: 'collision', title: 'About' })

    const bytes = await ogBytes(await requestOg('collision'))
    expect(bytes).not.toBeNull()
    expect(drawSpy).toHaveBeenCalledTimes(1)
    expect(drawSpy.mock.calls[0]?.[0]).toMatchObject({ title: 'Hello' })
  })

  it('falls back for an empty slug', async () => {
    expect((await requestOg('')).kind).toBe('redirect')
  })
})
