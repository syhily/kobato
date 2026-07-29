import { Hono } from 'hono'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { Env } from '@/server/http/context'
import type { Database } from '@/server/infra/db/database'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { installFetch } from '#/_helpers/fetch'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeRequestContext } from '#/_helpers/request-context'
import { onErrorHandler } from '@/server/http/errors'
import { webmentionRouter } from '@/server/http/resources/webmention'
import { page } from '@/server/infra/db/schema/page'
import { post } from '@/server/infra/db/schema/post'
import { webmention } from '@/server/infra/db/schema/webmention'
import { __resetRateLimitsForTests } from '@/server/infra/rate-limit'

const db = getTestDb()

const mockFetch = installFetch()

beforeEach(async () => {
  await clearAllTables(db)
  // The rate limiter is a process-level Map — reset it or earlier tests
  // (same client IP) exhaust the window for later ones.
  __resetRateLimitsForTests()
  mockFetch.reset()
  globalThis.fetch = mockFetch.fetch as unknown as typeof globalThis.fetch
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

function buildApp(clientAddress = '203.0.113.10') {
  const app = new Hono<Env>()
  app.onError(onErrorHandler)
  app.use('*', async (c, next) => {
    c.set('requestId', 'test-request')
    // Factory-built RequestContext — the router reads `.db` and the
    // rate-limit middleware reads `.clientAddress`; no other field of
    // the canonical context is consulted on this surface.
    c.set('requestContext', makeRequestContext({ clientAddress, db }))
    await next()
  })
  app.route('/', webmentionRouter)
  return app
}

async function seedLivePost(slug: string, title = 'Mentioned Post'): Promise<number> {
  const rows = await db
    .insert(post)
    .values({ slug, title, published: true, publishedRevisionId: 1 })
    .returning({ id: post.id })
  return rows[0]!.id
}

async function seedLivePage(slug: string, title = 'Mentioned Page'): Promise<number> {
  const rows = await db
    .insert(page)
    .values({ slug, title, published: true, publishedRevisionId: 1 })
    .returning({ id: page.id })
  return rows[0]!.id
}

function formPost(app: Hono<Env>, params: Record<string, string>) {
  return app.request('/webmention', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
}

const SOURCE = 'https://sender.example/blog/mentioning-post'
const linkingHtml = (href: string) =>
  `<html><head><title>Mentioning post</title><meta name="author" content="Jane Doe"></head>` +
  `<body><p>I wrote about <a href="${href}">this post</a>.</p></body></html>`

describe('integration / POST /webmention', () => {
  it('accepts a verified mention for a post target and stores it pending', async () => {
    const postId = await seedLivePost('wm-target')
    mockFetch.enqueue(SOURCE, new Response(linkingHtml('https://example.com/posts/wm-target'), { status: 200 }))

    const res = await formPost(buildApp(), { source: SOURCE, target: 'https://example.com/posts/wm-target' })
    expect(res.status).toBe(202)
    const body = (await res.json()) as { status: string; id: string }
    expect(body.status).toBe('pending')

    const rows = await db.select().from(webmention)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('pending')
    expect(rows[0]!.sourceUrl).toBe(SOURCE)
    expect(rows[0]!.targetUrl).toBe('https://example.com/posts/wm-target/')
    expect(rows[0]!.targetType).toBe('post')
    expect(rows[0]!.targetOwnerId).toBe(postId)
    expect(rows[0]!.title).toBe('Mentioning post')
    expect(rows[0]!.authorName).toBe('Jane Doe')
    expect(rows[0]!.fetchedAt).not.toBeNull()
    expect(rows[0]!.rawPayload).toEqual({ source: SOURCE, target: 'https://example.com/posts/wm-target' })
  })

  it('accepts a mention for a page target', async () => {
    const pageId = await seedLivePage('wm-page')
    mockFetch.enqueue(SOURCE, new Response(linkingHtml('https://example.com/wm-page/'), { status: 200 }))

    const res = await formPost(buildApp(), { source: SOURCE, target: 'https://example.com/wm-page/' })
    expect(res.status).toBe(202)
    const rows = await db.select().from(webmention)
    expect(rows[0]!.targetType).toBe('page')
    expect(rows[0]!.targetOwnerId).toBe(pageId)
  })

  it('rejects malformed or missing params with 400', async () => {
    const app = buildApp()
    expect((await formPost(app, { target: 'https://example.com/posts/wm-target' })).status).toBe(400)
    expect((await formPost(app, { source: 'not-a-url', target: 'https://example.com/posts/wm-target' })).status).toBe(
      400,
    )
    expect((await formPost(app, { source: SOURCE, target: 'ftp://example.com/x' })).status).toBe(400)
    expect((await formPost(app, {})).status).toBe(400)
  })

  it('rejects targets that are not live resources with 404', async () => {
    await seedLivePost('wm-target')
    mockFetch.enqueue(SOURCE, new Response(linkingHtml('https://example.com/posts/wm-target'), { status: 200 }))

    const app = buildApp()
    // Unknown slug.
    expect((await formPost(app, { source: SOURCE, target: 'https://example.com/posts/no-such-post' })).status).toBe(404)
    // Foreign origin.
    expect((await formPost(app, { source: SOURCE, target: 'https://other.example/posts/wm-target' })).status).toBe(404)
    // Single-segment paths resolve as pages; `archives` is not a page slug.
    expect((await formPost(app, { source: SOURCE, target: 'https://example.com/archives' })).status).toBe(404)
    // No source fetch may happen for an unresolvable target.
    expect(mockFetch.calls).toHaveLength(0)
  })

  it('rejects a source that does not link to the target', async () => {
    await seedLivePost('wm-target')
    mockFetch.enqueue(SOURCE, new Response('<html><body><p>No link at all.</p></body></html>', { status: 200 }))

    const res = await formPost(buildApp(), { source: SOURCE, target: 'https://example.com/posts/wm-target' })
    expect(res.status).toBe(400)
    expect((await db.select().from(webmention)).length).toBe(0)
  })

  it('rejects SSRF-blocked sources without fetching them', async () => {
    await seedLivePost('wm-target')
    const app = buildApp()
    for (const blocked of [
      'http://127.0.0.1:8080/x',
      'http://169.254.169.254/latest/meta-data',
      'http://localhost/x',
    ]) {
      const res = await formPost(app, { source: blocked, target: 'https://example.com/posts/wm-target' })
      expect(res.status).toBe(400)
    }
    expect(mockFetch.calls).toHaveLength(0)
    expect((await db.select().from(webmention)).length).toBe(0)
  })

  it('revalidates every redirect hop through the SSRF guard', async () => {
    await seedLivePost('wm-target')
    mockFetch.enqueue(SOURCE, new Response(null, { status: 302, headers: { location: 'http://192.168.1.1/internal' } }))

    const res = await formPost(buildApp(), { source: SOURCE, target: 'https://example.com/posts/wm-target' })
    expect(res.status).toBe(400)
    // The redirect target was never fetched.
    expect(mockFetch.calls.map((c) => c.url)).toEqual([SOURCE])
  })

  it('follows safe redirects and verifies the final document', async () => {
    await seedLivePost('wm-target')
    mockFetch.enqueue(SOURCE, new Response(null, { status: 302, headers: { location: 'https://cdn.example/final' } }))
    mockFetch.enqueue(
      'https://cdn.example/final',
      new Response(linkingHtml('https://example.com/posts/wm-target'), { status: 200 }),
    )

    const res = await formPost(buildApp(), { source: SOURCE, target: 'https://example.com/posts/wm-target' })
    expect(res.status).toBe(202)
  })

  it('rejects oversized sources via the declared content-length', async () => {
    await seedLivePost('wm-target')
    mockFetch.enqueue(
      SOURCE,
      new Response('x', { status: 200, headers: { 'content-length': String(2 * 1024 * 1024) } }),
    )

    const res = await formPost(buildApp(), { source: SOURCE, target: 'https://example.com/posts/wm-target' })
    expect(res.status).toBe(400)
    expect((await db.select().from(webmention)).length).toBe(0)
  })

  it('rejects sources that fail to fetch (timeout / unreachable / non-2xx)', async () => {
    await seedLivePost('wm-target')
    const app = buildApp()
    mockFetch.enqueue(SOURCE, () => {
      throw new Error('simulated timeout')
    })
    expect((await formPost(app, { source: SOURCE, target: 'https://example.com/posts/wm-target' })).status).toBe(400)

    mockFetch.enqueue(SOURCE, new Response('server error', { status: 500 }))
    expect((await formPost(app, { source: SOURCE, target: 'https://example.com/posts/wm-target' })).status).toBe(400)
    expect((await db.select().from(webmention)).length).toBe(0)
  })

  it('rate-limits repeated mentions from the same IP', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        resourceIp: { windowSeconds: 60, maxAttempts: 1 },
      },
    })
    await seedLivePost('wm-target')
    const app = buildApp()
    mockFetch.enqueue(SOURCE, new Response(linkingHtml('https://example.com/posts/wm-target'), { status: 200 }))
    expect((await formPost(app, { source: SOURCE, target: 'https://example.com/posts/wm-target' })).status).toBe(202)
    // Second mention from the same IP within the window is throttled.
    expect((await formPost(app, { source: SOURCE, target: 'https://example.com/posts/wm-target' })).status).toBe(429)
  })
})
