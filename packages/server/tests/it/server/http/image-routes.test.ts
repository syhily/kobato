import type { Env } from '@kobato/server/http/hono-env.ts'

import { content as contentTable } from '@kobato/db/schema/content.ts'
import { post as postTable } from '@kobato/db/schema/post.ts'
import { onErrorHandler } from '@kobato/server/http/errors.ts'
import { __rateLimitKeysForTests, __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit.ts'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { makeRequestContext } from '@kobato/server/tests/utils/request-context.ts'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The calendar renderer has its own real-canvas coverage; the route test pins
// the year/time/theme/locale routing through a fast spy.
const serveCalendarSpy = vi.spyOn(await import('@kobato/server/http/resources/calendar.ts'), 'serveCalendar')
serveCalendarSpy.mockImplementation(
  async (params: { year?: string; time?: string }, options: { theme: string; locale: string }) => {
    return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'X-Route-Theme': options.theme, 'X-Route-Locale': options.locale },
    })
  },
)

const db = getTestDb()

const { imagesRouter } = await import('@kobato/server/http/resources/images.ts')

const app = new Hono<Env>()
app.use('*', async (c, next) => {
  c.set('requestContext', makeRequestContext({ request: new Request(c.req.url), db }))
  await next()
})
app.route('/', imagesRouter)
app.onError(onErrorHandler)

beforeEach(async () => {
  serveCalendarSpy.mockClear()
  await clearAllTables(db)
  __resetRateLimitsForTests()
})

const coverDataUri = `data:image/png;base64,${(
  await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 32, g: 64, b: 128 } } })
    .png()
    .toBuffer()
).toString('base64')}`

async function seedLivePost(slug: string): Promise<number> {
  const rows = await db
    .insert(postTable)
    .values({
      slug,
      title: slug,
      cover: coverDataUri,
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
  it('redirects a non-hash avatar filename to the default avatar', async () => {
    const res = await app.request('/images/avatar/abcdef0123456789.png')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/images/default-avatar.png')
  })

  it('redirects an unknown numeric avatar id to the default avatar', async () => {
    const res = await app.request('/images/avatar/42.png')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/images/default-avatar.png')
  })

  it('rejects non-png extensions with 404', async () => {
    const res = await app.request('/images/avatar/42.jpg')
    expect(res.status).toBe(404)
  })

  it('uses counters dedicated to avatar requests', async () => {
    const res = await app.request('/images/avatar/abcdef0123456789.png')

    expect(res.status).toBe(302)
    expect(__rateLimitKeysForTests()).toEqual(['rate-limit:avatar-ip:127.0.0.1', 'rate-limit:avatar:abcdef0123456789'])
  })

  it('allows five requests per avatar per second and tracks avatars independently', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await app.request('/images/avatar/abcdef0123456789.png')
      expect(res.status).toBe(302)
    }

    const limited = await app.request('/images/avatar/abcdef0123456789.png')
    expect(limited.status).toBe(429)
    expect(await limited.json()).toMatchObject({
      error: { code: 'TOO_MANY_REQUESTS', message: '请求过于频繁，请稍后再试。' },
    })
    expect((await app.request('/images/avatar/fedcba9876543210.png')).status).toBe(302)
  })

  it('allows 3000 avatar requests per IP per minute', async () => {
    for (let i = 0; i < 3000; i += 1) {
      const res = await app.request(`/images/avatar/avatar-${i}.png`)
      expect(res.status).toBe(302)
    }

    expect((await app.request('/images/avatar/avatar-overflow.png')).status).toBe(429)
  }, 60_000)
})

describe('imagesRouter og', () => {
  it('renders a real OG image when the slug matches a live post row', async () => {
    await seedLivePost('hello-world')

    const res = await app.request('/images/og/hello-world.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect([...new Uint8Array(await res.arrayBuffer()).slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
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
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(serveCalendarSpy).toHaveBeenCalledWith({ year: '2024', time: '12-25' }, expect.anything())
    expect(res.headers.get('X-Route-Theme')).toBe('light')
    expect(res.headers.get('X-Route-Locale')).toBe('zh-CN')
  })

  it('routes the dark variant to the dark theme', async () => {
    const res = await app.request('/images/calendar/dark/2024/01-01.png')
    expect(res.status).toBe(200)
    expect(serveCalendarSpy).toHaveBeenCalledWith({ year: '2024', time: '01-01' }, expect.anything())
    expect(res.headers.get('X-Route-Theme')).toBe('dark')
    expect(res.headers.get('X-Route-Locale')).toBe('zh-CN')
  })
})
