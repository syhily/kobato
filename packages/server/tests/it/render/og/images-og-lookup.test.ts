import type { Env } from '@kobato/server/http/context'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'

import { content as contentTable } from '@kobato/server/infra/db/schema/content'
import { page as pageTable } from '@kobato/server/infra/db/schema/page'
import { post as postTable } from '@kobato/server/infra/db/schema/post'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Tests for the OG image route slug resolution in `imagesRouter`.
// The route uses slim public-meta lookups (findPublicPostMetaBySlug +
// findPublicPageMetaBySlug) instead of the heavier findPostBySlug /
// findPageBySlug.
//
// Real engine: posts/pages are seeded meta rows (+ published revisions),
// so the live gate decides the fallback branches for real. The only kept
// seam is the canvas OG renderer — its stub echoes the title into the
// PNG body so the "post wins" branch is observable on the wire instead
// of through mock call args.

vi.mock('@kobato/server/render/og/render', () => ({
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

// Static import on purpose: a lazy beforeEach import puts the first heavy
// module load under the 10s hookTimeout and flakes under parallel load, while
// a top-level import is measured as file import time. vi.mock calls above are
// hoisted, so the mocks still apply.
import { imagesRouter } from '@kobato/server/http/resources/images'

// Minimal requestContext stub — the rate-limit middleware reads
// `.clientAddress`, the OG handler reads `.db`; no other field of the
// canonical context is consulted on this surface.
const app = new Hono<Env>()
app.use('*', async (c, next) => {
  c.set('requestContext', { clientAddress: '127.0.0.1', db } as unknown as Env['Variables']['requestContext'])
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
    // The rendered PNG carries the post's title, not the page's.
    expect(await res.text()).toBe('og:Hello')
  })

  it('404 for empty slug (route pattern mismatch)', async () => {
    // The route regex `[^/]+\.png` requires at least one character before `.png`,
    // so `/images/og/.png` does not match and returns 404 without hitting the handler.
    const res = await requestOg('')
    expect(res.status).toBe(404)
  })
})
