import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Env } from '@/server/http/context'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { installFetch } from '#/_helpers/fetch'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeRequestContext } from '#/_helpers/request-context'
import { onErrorHandler } from '@/server/http/errors'
import { webmentionRouter } from '@/server/http/resources/webmention'
import { page } from '@/server/infra/db/schema/page'
import { post } from '@/server/infra/db/schema/post'
import { webmention, webmentionInbox } from '@/server/infra/db/schema/webmention'
import { __resetRateLimitsForTests } from '@/server/infra/rate-limit'

const db = getTestDb()

// Verification moved to the inbox worker (plan 026 Phase 2): the
// endpoint must NEVER fetch the source. The mock stays installed so any
// regression that reaches for globalThis.fetch shows up in `calls`.
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

describe('integration / POST /webmention (async enqueue)', () => {
  it('enqueues a mention for a post target and answers 202 without fetching', async () => {
    await seedLivePost('wm-target')

    const res = await formPost(buildApp(), { source: SOURCE, target: 'https://example.com/posts/wm-target' })
    expect(res.status).toBe(202)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('pending')

    // No fetch, no mention row yet — the pair sits in the inbox queue,
    // source normalized and target canonicalized.
    expect(mockFetch.calls).toHaveLength(0)
    expect(await db.select().from(webmention)).toHaveLength(0)
    const queued = await db.select().from(webmentionInbox)
    expect(queued).toHaveLength(1)
    expect(queued[0]!.sourceUrl).toBe(SOURCE)
    expect(queued[0]!.targetUrl).toBe('https://example.com/posts/wm-target/')
    expect(queued[0]!.attempts).toBe(0)
    expect(queued[0]!.nextRetryAt).toBeNull()
  })

  it('enqueues a mention for a page target', async () => {
    await seedLivePage('wm-page')

    const res = await formPost(buildApp(), { source: SOURCE, target: 'https://example.com/wm-page/' })
    expect(res.status).toBe(202)
    const queued = await db.select().from(webmentionInbox)
    expect(queued).toHaveLength(1)
    expect(queued[0]!.targetUrl).toBe('https://example.com/wm-page/')
  })

  it('folds a repeat POST of the same pair into one queued row', async () => {
    await seedLivePost('wm-target')
    const app = buildApp()
    expect((await formPost(app, { source: SOURCE, target: 'https://example.com/posts/wm-target' })).status).toBe(202)
    expect((await formPost(app, { source: SOURCE, target: 'https://example.com/posts/wm-target' })).status).toBe(202)

    expect(await db.select().from(webmentionInbox)).toHaveLength(1)
  })

  it('converges source URL variants (fragment / trailing slash) onto one queued row', async () => {
    await seedLivePost('wm-target')
    const app = buildApp()
    for (const source of [SOURCE, `${SOURCE}#comments`, `${SOURCE}/`]) {
      expect((await formPost(app, { source, target: 'https://example.com/posts/wm-target' })).status).toBe(202)
    }

    const queued = await db.select().from(webmentionInbox)
    expect(queued).toHaveLength(1)
    expect(queued[0]!.sourceUrl).toBe(SOURCE)
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

    const app = buildApp()
    // Unknown slug.
    expect((await formPost(app, { source: SOURCE, target: 'https://example.com/posts/no-such-post' })).status).toBe(404)
    // Foreign origin.
    expect((await formPost(app, { source: SOURCE, target: 'https://other.example/posts/wm-target' })).status).toBe(404)
    // Single-segment paths resolve as pages; `archives` is not a page slug.
    expect((await formPost(app, { source: SOURCE, target: 'https://example.com/archives' })).status).toBe(404)
    // Unresolvable targets never reach the queue either.
    expect(mockFetch.calls).toHaveLength(0)
    expect(await db.select().from(webmentionInbox)).toHaveLength(0)
  })

  it('rejects a request whose declared content-length exceeds the 16KB form cap', async () => {
    const res = await buildApp().request('/webmention', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': String(20 * 1024),
      },
      body: 'x'.repeat(20 * 1024),
    })
    expect(res.status).toBe(413)
    expect((await db.select().from(webmentionInbox)).length).toBe(0)
  })

  it('rejects a chunked request without content-length whose body exceeds the 16KB form cap', async () => {
    // A stream body carries no content-length — this is the chunked
    // transfer-encoding shape that must not bypass the cap and buffer
    // the entire payload in memory.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(20 * 1024)))
        controller.close()
      },
    })
    const res = await buildApp().request('/webmention', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: stream,
      // @ts-expect-error — Node.js fetch requires duplex when sending a stream body
      duplex: 'half',
    })
    expect(res.status).toBe(413)
    expect((await db.select().from(webmentionInbox)).length).toBe(0)
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
    expect((await formPost(app, { source: SOURCE, target: 'https://example.com/posts/wm-target' })).status).toBe(202)
    // Second mention from the same IP within the window is throttled.
    expect((await formPost(app, { source: SOURCE, target: 'https://example.com/posts/wm-target' })).status).toBe(429)
  })
})

describe('integration / POST /webmention — receive switch (G5)', () => {
  it('answers 410 Gone and enqueues nothing when receiving is disabled', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      webmentions: { webmention: { receiveEnabled: false, displayOnPosts: true } },
    })
    await seedLivePost('wm-target')
    const res = await formPost(buildApp(), { source: SOURCE, target: 'https://example.com/posts/wm-target' })
    expect(res.status).toBe(410)
    expect(mockFetch.calls).toHaveLength(0)
    expect((await db.select().from(webmentionInbox)).length).toBe(0)
  })
})
