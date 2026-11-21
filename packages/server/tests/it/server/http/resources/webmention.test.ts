import type { Env } from '@kobato/server/http/hono-env.ts'

import { upsertWebmentionInbox } from '@kobato/db/operations/webmention-inbox.ts'
import { page } from '@kobato/db/schema/page.ts'
import { post } from '@kobato/db/schema/post.ts'
import { webmention, webmentionInbox } from '@kobato/db/schema/webmention.ts'
import { INBOX_MAX_QUEUED, INBOX_MAX_QUEUED_PER_SOURCE_HOST } from '@kobato/server/domains/webmentions/inbox-enqueue.ts'
import { onErrorHandler } from '@kobato/server/http/errors.ts'
import { webmentionRouter } from '@kobato/server/http/resources/webmention.ts'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit.ts'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { makeRequestContext } from '@kobato/server/tests/utils/request-context.ts'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings.ts'
import { installFetch } from '@kobato/test/fetch.ts'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

const mockFetch = installFetch()

beforeEach(async () => {
  await clearAllTables(db)
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
    expect((await formPost(app, { source: SOURCE, target: 'https://example.com/posts/no-such-post' })).status).toBe(404)
    expect((await formPost(app, { source: SOURCE, target: 'https://other.example/posts/wm-target' })).status).toBe(404)
    expect((await formPost(app, { source: SOURCE, target: 'https://example.com/archives' })).status).toBe(404)
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
        resource: { windowSeconds: 60, maxAttempts: 1 },
      },
    })
    await seedLivePost('wm-target')
    const app = buildApp()
    expect((await formPost(app, { source: SOURCE, target: 'https://example.com/posts/wm-target' })).status).toBe(202)
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

describe('integration / POST /webmention (bounded queue)', () => {
  it('backpressures with 429 once the global depth cap is reached', async () => {
    await seedLivePost('wm-target')
    for (let i = 0; i < INBOX_MAX_QUEUED; i++) {
      await upsertWebmentionInbox(db, {
        sourceUrl: `https://host-${i}.example/x`,
        targetUrl: 'https://example.com/posts/wm-target/',
      })
    }

    const res = await formPost(buildApp(), { source: SOURCE, target: 'https://example.com/posts/wm-target' })

    expect(res.status).toBe(429)
    expect(await db.select().from(webmentionInbox)).toHaveLength(INBOX_MAX_QUEUED)
  })

  it('backpressures a flooded source host while other hosts still enqueue', async () => {
    await seedLivePost('wm-target')
    for (let i = 0; i < INBOX_MAX_QUEUED_PER_SOURCE_HOST; i++) {
      await upsertWebmentionInbox(db, {
        sourceUrl: `https://spam.example/p${i}`,
        targetUrl: 'https://example.com/posts/wm-target/',
      })
    }
    const app = buildApp()

    expect(
      (await formPost(app, { source: 'https://spam.example/new', target: 'https://example.com/posts/wm-target' }))
        .status,
    ).toBe(429)
    expect((await formPost(app, { source: SOURCE, target: 'https://example.com/posts/wm-target' })).status).toBe(202)
  })
})
