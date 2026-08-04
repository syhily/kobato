import type { Env } from '@kobato/server/http/context'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'

import { onErrorHandler } from '@kobato/server/http/errors'
import { content as contentTable } from '@kobato/server/infra/db/schema/content'
import { post as postTable } from '@kobato/server/infra/db/schema/post'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Regression net for the Hono path-parser footgun that was silently
// degrading every `/images/*.png` endpoint to its fallback branch.
//
// Pattern `/foo/:name.png` does NOT match `:name` against a single
// segment and `.png` as a literal suffix. Hono treats the `.png` as
// part of the param NAME, so `c.req.param('name')` returns `undefined`
// and `c.req.param()` reveals an entry keyed `name.png`. Every handler
// then short-circuits to its "missing param" fallback. The user-facing
// symptom is "every avatar shows the default" — and (silently) every
// OG image and calendar image too.
//
// The fix in `src/server/http/resources/images.ts` declares each route
// with an explicit `{[^/]+\\.png}` constraint and strips the extension
// in the handler. These tests pin both halves.
//
// Real engine: the OG slug lookups run against seeded post rows, the
// in-process rate limiter and the kv-backed cache registry run for real.
// The kept seams are the heavy/external backends: gravatar avatar
// fetching (network), OG canvas rendering, and the calendar renderer —
// each stub echoes its arguments onto the wire so param extraction is
// asserted through response bodies, not mock call args.

vi.mock('@kobato/server/domains/comments/services/avatar', async (importActual) => {
  const actual = await importActual<typeof import('@kobato/server/domains/comments/services/avatar')>()
  return {
    ...actual,
    // Echo stub: the route maps a `png` outcome straight onto the wire,
    // so the extracted hash + size are observable in the response body.
    serveAvatar: vi.fn(async (_db: unknown, hash: string, size: number) => ({
      kind: 'png' as const,
      buffer: Buffer.from(`${hash}:${size}`),
    })),
  }
})
vi.mock('@kobato/server/render/og/render', () => ({
  drawOpenGraph: vi.fn().mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
}))
vi.mock('@kobato/server/http/resources/calendar', () => ({
  serveCalendar: vi.fn().mockImplementation(
    async (_db: unknown, params: { year?: string; time?: string }, theme: string) =>
      new Response(JSON.stringify({ params, theme }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  ),
}))

const db = getTestDb()

const { imagesRouter } = await import('@kobato/server/http/resources/images')

// The perimeter normally derives the canonical RequestContext in
// `requestContextMiddleware`; these route-level tests wrap the router in an
// app that stubs the only two fields the images pipeline reads
// (rate-limit → `clientAddress`, handlers → `db`).
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
    // Route does NOT 404 (it now resolves the hash; the path-parser bug
    // would have driven this into the missing-param fallback).
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
    // 30 requests per 60s per IP; the 31st is answered 429 with the
    // standard API error shape — before any mirror fetch happens.
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
