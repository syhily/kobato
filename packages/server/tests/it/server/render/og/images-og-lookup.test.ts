import type { Env } from '@kobato/server/http/hono-env'

import { content as contentTable } from '@kobato/db/schema/content'
import { page as pageTable } from '@kobato/db/schema/page'
import { post as postTable } from '@kobato/db/schema/post'
import { drawOpenGraph } from '@kobato/server/render/og/render'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { representationRevisionsFor } from '@kobato/settings/representation-scopes'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = getTestDb()

const drawSpy = vi.spyOn(await import('@kobato/server/render/og/render'), 'drawOpenGraph')
void drawOpenGraph

const coverDataUri = `data:image/png;base64,${(
  await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 32, g: 64, b: 128 } } })
    .png()
    .toBuffer()
).toString('base64')}`

beforeEach(async () => {
  drawSpy.mockClear()
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
  const rows = await db
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
    const revisions = await db
      .insert(contentTable)
      .values({ type: 'post', ownerId: postId, revisionNo: 1, status: 'published', body: [] })
      .returning({ id: contentTable.id })
    await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, postId))
  }
  return postId
}

async function seedPage(opts: { slug: string; title?: string; publishedAt?: Date }): Promise<number> {
  const rows = await db
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
  const revisions = await db
    .insert(contentTable)
    .values({ type: 'page', ownerId: pageId, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: contentTable.id })
  await db.update(pageTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(pageTable.id, pageId))
  return pageId
}

import { imagesRouter } from '@kobato/server/http/resources/images'

const app = new Hono<Env>()
app.use('*', async (c, next) => {
  c.set('requestContext', {
    clientAddress: '127.0.0.1',
    db,
    settings: TEST_BLOG_SETTINGS_BUNDLE,
    localization: {
      locale: 'zh-CN',
      timeZone: 'Asia/Shanghai',
      timeFormat: null,
      revision: 'test-boot:0000000001',
      revisions: representationRevisionsFor(TEST_BLOG_SETTINGS_BUNDLE),
    },
  } as unknown as Env['Variables']['requestContext'])
  await next()
})
app.route('/', imagesRouter)

async function requestOg(slug: string) {
  const res = await app.request(`/images/og/${slug}.png`)
  return res
}

describe('OG image slug resolution', () => {
  it('returns PNG when slug matches a public post', async () => {
    await seedPost({ slug: 'hello', title: 'Hello', summary: 'World' })

    const res = await requestOg('hello')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect([...new Uint8Array(await res.arrayBuffer()).slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(drawSpy.mock.calls[0]?.[0]).toMatchObject({ title: 'Hello' })
  })

  it('returns PNG when slug matches a public page', async () => {
    await seedPage({ slug: 'about', title: 'About' })

    const res = await requestOg('about')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect([...new Uint8Array(await res.arrayBuffer()).slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
    expect(drawSpy.mock.calls[0]?.[0]).toMatchObject({ title: 'About' })
  })

  it('falls back when slug matches neither post nor page', async () => {
    const res = await requestOg('nonexistent')
    expect(res.status).toBe(302)
    expect(drawSpy).not.toHaveBeenCalled()
  })

  it('falls back when post is not public', async () => {
    await seedPost({ slug: 'draft-post', published: false, withRevision: false })

    const res = await requestOg('draft-post')
    expect(res.status).toBe(302)
  })

  it('falls back when page is scheduled (publishedAt in the future)', async () => {
    await seedPage({ slug: 'scheduled-page', publishedAt: new Date('2099-01-01') })

    const res = await requestOg('scheduled-page')
    expect(res.status).toBe(302)
  })

  it('uses post data when both post and page match (post wins)', async () => {
    await seedPost({ slug: 'collision', title: 'Hello', summary: 'World' })
    await seedPage({ slug: 'collision', title: 'About' })

    const res = await requestOg('collision')
    expect(res.status).toBe(200)
    expect(drawSpy).toHaveBeenCalledTimes(1)
    expect(drawSpy.mock.calls[0]?.[0]).toMatchObject({ title: 'Hello' })
  })

  it('404 for empty slug (route pattern mismatch)', async () => {
    const res = await requestOg('')
    expect(res.status).toBe(404)
  })
})
