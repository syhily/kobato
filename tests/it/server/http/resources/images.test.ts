import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { page as pageTable } from '@/server/infra/db/schema/page'
import { post as postTable } from '@/server/infra/db/schema/post'
import { category as categoryTable } from '@/server/infra/db/schema/taxonomy'

// `imagesRouter` outcome-mapping tests against the real engine: slug
// resolution (posts / pages / categories) hits seeded rows, the live
// gate, the in-process rate limiter, and the kv-backed cache registry
// all run for real — including the real `serveCalendar` (date validation
// + `through()` cache registration). The kept seams are the
// heavy/external backends: gravatar avatar fetching (network), OG canvas
// rendering, and the native-canvas calendar renderer.

vi.mock('@/server/render/calendar/render', () => ({
  renderCalendar: vi.fn(),
}))

vi.mock('@/server/domains/comments/services/avatar', async (importActual) => {
  const actual = await importActual<typeof import('@/server/domains/comments/services/avatar')>()
  return {
    ...actual,
    serveAvatar: vi.fn(),
  }
})

vi.mock('@/server/render/og/render', () => ({
  drawOpenGraph: vi.fn().mockResolvedValue(Buffer.from('png')),
}))

import { serveAvatar } from '@/server/domains/comments/services/avatar'
import { imagesRouter } from '@/server/http/resources/images'
import { renderCalendar } from '@/server/render/calendar/render'

const db = getTestDb()

function requestImages(url: string) {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', { db, clientAddress: '127.0.0.1' } as never)
    await next()
  })
  app.route('/', imagesRouter)
  return app.request(url)
}

async function seedLivePost(slug: string): Promise<void> {
  const rows = await db
    .insert(postTable)
    .values({
      slug,
      title: 'Post',
      summary: 'Summary',
      cover: 'cover.jpg',
      published: true,
      publishedAt: new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
      visible: true,
    })
    .returning({ id: postTable.id })
  const revisions = await db
    .insert(contentTable)
    .values({ type: 'post', ownerId: rows[0]!.id, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: contentTable.id })
  await db.update(postTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(postTable.id, rows[0]!.id))
}

async function seedLivePage(slug: string): Promise<void> {
  const rows = await db
    .insert(pageTable)
    .values({
      slug,
      title: 'Page',
      summary: 'Page summary',
      cover: 'cover.jpg',
      published: true,
      publishedAt: new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
    })
    .returning({ id: pageTable.id })
  const revisions = await db
    .insert(contentTable)
    .values({ type: 'page', ownerId: rows[0]!.id, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: contentTable.id })
  await db.update(pageTable).set({ publishedRevisionId: revisions[0]!.id }).where(eq(pageTable.id, rows[0]!.id))
}

describe('images resource', () => {
  beforeEach(async () => {
    await clearAllTables(db)
    vi.clearAllMocks()
    ;(renderCalendar as ReturnType<typeof vi.fn>).mockResolvedValue(Buffer.from('cal'))
    // Default: the domain reports "no avatar" — the redirect mapping tests
    // override per case.
    ;(serveAvatar as ReturnType<typeof vi.fn>).mockResolvedValue({ kind: 'redirect' })
  })

  it('renders an OG image for a post', async () => {
    await seedLivePost('post')
    const res = await requestImages('http://localhost/images/og/post.png')
    expect(res.status).toBe(200)
  })

  it('renders an OG image for a page', async () => {
    await seedLivePage('page')
    const res = await requestImages('http://localhost/images/og/page.png')
    expect(res.status).toBe(200)
  })

  it('falls back when no entity is found', async () => {
    const res = await requestImages('http://localhost/images/og/missing.png')
    expect(res.status).toBe(302)
  })

  it('renders an OG image for a category', async () => {
    await db.insert(categoryTable).values({ name: 'Code', slug: 'code', description: '', cover: '' })
    const res = await requestImages('http://localhost/images/og/cats/code.png')
    expect(res.status).toBe(200)
  })

  it('serves a calendar image', async () => {
    const res = await requestImages('http://localhost/images/calendar/2026/0424.png')
    expect(res.status).toBe(200)
  })

  it('serves a dark calendar image', async () => {
    const res = await requestImages('http://localhost/images/calendar/dark/2026/0424.png')
    expect(res.status).toBe(200)
  })

  it('rejects an invalid MMdd calendar date with a 404 (real serveCalendar date validation)', async () => {
    // Month 13 passes the shape regex but rolls over in the date-fns parse
    // and fails the round-trip check — the real `HTTPException(404)` is
    // mapped to a proper 404 response by Hono's error handling.
    const res = await requestImages('http://localhost/images/calendar/2026/1332.png')
    expect(res.status).toBe(404)
  })

  it('maps a png outcome to a 200 image/png response', async () => {
    ;(serveAvatar as ReturnType<typeof vi.fn>).mockResolvedValue({ kind: 'png', buffer: Buffer.from('av') })
    const res = await requestImages('http://localhost/images/avatar/abc.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=604800')
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from('av'))
  })

  it('maps a redirect outcome to the default avatar URL', async () => {
    ;(serveAvatar as ReturnType<typeof vi.fn>).mockResolvedValue({ kind: 'redirect' })
    const res = await requestImages('http://localhost/images/avatar/abc.png')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://example.com/images/default-avatar.png')
  })

  it('threads the `?s=` size into the domain call, defaulting to 120', async () => {
    const res = await requestImages('http://localhost/images/avatar/abc.png?s=256')
    expect(res.status).toBe(302)
    expect(serveAvatar).toHaveBeenCalledWith(expect.anything(), 'abc', 256)
    ;(serveAvatar as ReturnType<typeof vi.fn>).mockClear()
    await requestImages('http://localhost/images/avatar/abc.png')
    expect(serveAvatar).toHaveBeenCalledWith(expect.anything(), 'abc', 120)
  })
})
