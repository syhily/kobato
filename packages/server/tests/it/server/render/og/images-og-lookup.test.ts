import type { Env } from '@kobato/server/http/context.ts'

import { content as contentTable } from '@kobato/server/infra/db/schema/content.ts'
import { page as pageTable } from '@kobato/server/infra/db/schema/page.ts'
import { post as postTable } from '@kobato/server/infra/db/schema/post.ts'
import { representationRevisionsFor } from '@kobato/shared/config/representation-scopes.ts'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/test-helpers/blog-settings.ts'
import { clearAllTables, getTestDb } from '@kobato/test-helpers/integration-db.ts'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// OG slug resolution against the real engine (slim public-meta lookups +
// live gate). Only mock: the canvas renderer, whose stub echoes the title
// into the PNG body so branches are observable on the wire.

vi.mock('@kobato/server/render/og/render.ts', () => ({
  drawOpenGraph: vi.fn(async ({ title }: { title: string }) => Buffer.from(`og:${title}`)),
}))

const db = getTestDb()

beforeEach(async () => {
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
      cover: '/cover.png',
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
      cover: '/about.png',
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

// Static import on purpose: a lazy beforeEach import would flake under the
// 10s hookTimeout; the hoisted vi.mock calls still apply.
import { imagesRouter } from '@kobato/server/http/resources/images.ts'

// Stub covers the consulted fields: rate-limit `.clientAddress`, handler
// `.db`, plus the pinned settings/localization the OG key + renderer read.
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
    expect(await res.text()).toBe('og:Hello')
  })

  it('returns PNG when slug matches a public page', async () => {
    await seedPage({ slug: 'about', title: 'About' })

    const res = await requestOg('about')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(await res.text()).toBe('og:About')
  })

  it('falls back when slug matches neither post nor page', async () => {
    const res = await requestOg('nonexistent')
    expect(res.status).toBe(302)
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
    expect(await res.text()).toBe('og:Hello')
  })

  it('404 for empty slug (route pattern mismatch)', async () => {
    const res = await requestOg('')
    expect(res.status).toBe(404)
  })
})
