import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { onErrorHandler } from '@/server/http/errors'
import { content as contentTable } from '@/server/infra/db/schema/content'
import { post as postTable } from '@/server/infra/db/schema/post'
import { __resetRateLimitsForTests } from '@/server/infra/rate-limit'

// `/images/*.png` param extraction against the real engine (seeded rows,
// rate limiter, kv cache); seams: avatar fetch, OG canvas, calendar renderer.
// Hono folds `.png` into the param NAME — routes need explicit `{[^/]+\\.png}` constraints.

vi.mock('@/server/domains/comments/services/avatar', async (importActual) => {
  const actual = await importActual<typeof import('@/server/domains/comments/services/avatar')>()
  return {
    ...actual,
    // Echo stub: the extracted hash + size are observable in the response body.
    serveAvatar: vi.fn(async (_db: unknown, hash: string, size: number) => ({
      kind: 'png' as const,
      buffer: Buffer.from(`${hash}:${size}`),
    })),
  }
})
vi.mock('@/server/render/og/render', () => ({
  drawOpenGraph: vi.fn().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
}))
vi.mock('@/server/http/resources/calendar', () => ({
  serveCalendar: vi.fn().mockImplementation(
    async (_db: unknown, params: { year?: string; time?: string }, theme: string) =>
      new Response(JSON.stringify({ params, theme }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  ),
}))

const db = getTestDb()

const { imagesRouter } = await import('@/server/http/resources/images')

// Stub app provides only `clientAddress` + `db`, the fields the images pipeline reads.
const app = new Hono<Env>()
app.use('*', async (c, next) => {
  c.set('requestContext', {
    clientAddress: '127.0.0.1',
    db,
  } as unknown as Env['Variables']['requestContext'])
  await next()
})
app.route('/', imagesRouter)
app.onError(onErrorHandler)

beforeEach(async () => {
  await clearAllTables(db)
  __resetRateLimitsForTests()
})

async function seedLivePost(slug: string): Promise<number> {
  const rows = await db
    .insert(postTable)
    .values({
      slug,
      title: slug,
      published: true,
      publishedAt: new Date('2024-01-01'),
      firstPublishedAt: new Date('2024-01-01'),
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

describe('imagesRouter avatar', () => {
  it('extracts the bare hash from `/images/avatar/<hash>.png`', async () => {
    const res = await app.request('/images/avatar/abcdef0123456789.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    // No `?s=` → the default size, rounded up to its cache bucket (128).
    expect(await res.text()).toBe('abcdef0123456789:128')
  })

  it('matches numeric ids the same way', async () => {
    const res = await app.request('/images/avatar/42.png')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('42:128')
  })

  it('rejects non-png extensions with 404', async () => {
    const res = await app.request('/images/avatar/42.jpg')
    expect(res.status).toBe(404)
  })

  it('throttles the avatar route with its own stricter bucket', async () => {
    // 30 per 60s per IP; the 31st → 429.
    for (let i = 0; i < 30; i += 1) {
      const res = await app.request('/images/avatar/abcdef0123456789.png')
      expect(res.status).toBe(200)
    }
    const res = await app.request('/images/avatar/abcdef0123456789.png')
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: { message: '请求过于频繁，请稍后再试。' } })
  })
})

describe('imagesRouter og', () => {
  it('renders an OG image when the slug matches a live post row', async () => {
    await seedLivePost('hello-world')

    const res = await app.request('/images/og/hello-world.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('falls back to the site OG image when no post or page matches the slug', async () => {
    const res = await app.request('/images/og/missing.png')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://example.com/images/open-graph.png')
  })
})

describe('imagesRouter calendar', () => {
  it('extracts year + time from `/images/calendar/<year>/<time>.png`', async () => {
    const res = await app.request('/images/calendar/2024/12-25.png')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { params: { year: string; time: string }; theme: string }
    expect(body.params).toEqual({ year: '2024', time: '12-25' })
    expect(body.theme).toBe('light')
  })

  it('routes the dark variant to the dark theme', async () => {
    const res = await app.request('/images/calendar/dark/2024/01-01.png')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { params: { year: string; time: string }; theme: string }
    expect(body.params).toEqual({ year: '2024', time: '01-01' })
    expect(body.theme).toBe('dark')
  })
})
