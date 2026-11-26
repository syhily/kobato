import { sqliteOf } from '@kobato/db/sqlite/database'
import { upsertWebmentionInbox } from '@kobato/db/sqlite/operations/engagement/webmention-inbox'
import { page } from '@kobato/db/sqlite/schema/page'
import { post } from '@kobato/db/sqlite/schema/post'
import { webmention, webmentionInbox } from '@kobato/db/sqlite/schema/webmention'
import { INBOX_MAX_QUEUED_PER_SOURCE_HOST } from '@kobato/server/domains/webmentions/inbox-enqueue'
import { webmentionPublicRouter } from '@kobato/server/http/controllers/public/webmention-public.controller'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makePublicCtx } from '@kobato/server/tests/utils/mock-ctx'
import { parseRpcJson } from '@kobato/server/tests/utils/rpc-call'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { installFetch } from '@kobato/test/fetch'
import { RPCHandler } from '@orpc/server/fetch'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

const mockFetch = installFetch()

const INVALID_MESSAGE = 'Invalid webmention request: source and target must be valid http(s) URLs'
const DISABLED_MESSAGE = 'This endpoint no longer accepts webmentions'
const TARGET_NOT_FOUND_MESSAGE = 'target is not a resource on this site'
const RATE_LIMITED_MESSAGE = '请求过于频繁，请稍后再试。'

const handler = new RPCHandler(webmentionPublicRouter)

async function callReceive(input: { source: string; target: string }, clientAddress = '203.0.113.10') {
  const result = await handler.handle(
    new Request('http://localhost/rpc/receive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: input }),
    }),
    { prefix: '/rpc', context: makePublicCtx({ db, clientAddress }) },
  )
  if (!result.matched) {
    throw new Error('no route matched for the receive procedure')
  }
  return result.response
}

async function seedLivePost(slug: string, title = 'Mentioned Post'): Promise<void> {
  await sqliteOf(db).insert(post).values({ slug, title, published: true, publishedRevisionId: 1 })
}

async function seedLivePage(slug: string, title = 'Mentioned Page'): Promise<void> {
  await sqliteOf(db).insert(page).values({ slug, title, published: true, publishedRevisionId: 1 })
}

const SOURCE = 'https://sender.example/blog/mentioning-post'

beforeEach(async () => {
  await clearAllTables(db)
  __resetRateLimitsForTests()
  mockFetch.reset()
  globalThis.fetch = mockFetch.fetch as unknown as typeof globalThis.fetch
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

describe('integration / public.webmentions.receive (async enqueue)', () => {
  it('answers accepted for a post target and enqueues without fetching', async () => {
    await seedLivePost('wm-target')

    const res = await callReceive({ source: SOURCE, target: 'https://example.com/posts/wm-target' })
    expect(res.status).toBe(200)
    const answer = await parseRpcJson<{ kind: string }>(res)
    expect(answer).toEqual({ kind: 'accepted' })

    expect(mockFetch.calls).toHaveLength(0)
    expect(await sqliteOf(db).select().from(webmention)).toHaveLength(0)
    const queued = await sqliteOf(db).select().from(webmentionInbox)
    expect(queued).toHaveLength(1)
    expect(queued[0]!.sourceUrl).toBe(SOURCE)
    expect(queued[0]!.targetUrl).toBe('https://example.com/posts/wm-target/')
    expect(queued[0]!.attempts).toBe(0)
    expect(queued[0]!.nextRetryAt).toBeNull()
  })

  it('enqueues a mention for a page target', async () => {
    await seedLivePage('wm-page')

    const res = await callReceive({ source: SOURCE, target: 'https://example.com/wm-page/' })
    expect(res.status).toBe(200)
    const queued = await sqliteOf(db).select().from(webmentionInbox)
    expect(queued).toHaveLength(1)
    expect(queued[0]!.targetUrl).toBe('https://example.com/wm-page/')
  })

  it('folds a repeat call of the same pair into one queued row', async () => {
    await seedLivePost('wm-target')
    expect((await callReceive({ source: SOURCE, target: 'https://example.com/posts/wm-target' })).status).toBe(200)
    expect((await callReceive({ source: SOURCE, target: 'https://example.com/posts/wm-target' })).status).toBe(200)

    expect(await sqliteOf(db).select().from(webmentionInbox)).toHaveLength(1)
  })

  it('converges source URL variants (fragment / trailing slash) onto one queued row', async () => {
    await seedLivePost('wm-target')
    for (const source of [SOURCE, `${SOURCE}#comments`, `${SOURCE}/`]) {
      expect((await callReceive({ source, target: 'https://example.com/posts/wm-target' })).status).toBe(200)
    }

    const queued = await sqliteOf(db).select().from(webmentionInbox)
    expect(queued).toHaveLength(1)
    expect(queued[0]!.sourceUrl).toBe(SOURCE)
  })

  it('answers the captured invalid envelope for malformed or missing params', async () => {
    for (const input of [
      { source: '', target: 'https://example.com/posts/wm-target' },
      { source: 'not-a-url', target: 'https://example.com/posts/wm-target' },
      { source: SOURCE, target: 'ftp://example.com/x' },
      { source: '', target: '' },
    ]) {
      const res = await callReceive(input)
      expect(res.status).toBe(200)
      const answer = await parseRpcJson<{ kind: string; message: string }>(res)
      expect(answer).toEqual({ kind: 'invalid', message: INVALID_MESSAGE })
    }
    expect(await sqliteOf(db).select().from(webmentionInbox)).toHaveLength(0)
  })

  it('answers the captured NOT_FOUND error for targets that are not live resources', async () => {
    await seedLivePost('wm-target')

    const res = await callReceive({ source: SOURCE, target: 'https://example.com/posts/no-such-post' })
    expect(res.status).toBe(404)
    const envelope = (await res.json()) as { json: { code: string; message: string; data: { descriptor: unknown } } }
    expect(envelope.json.code).toBe('NOT_FOUND')
    expect(envelope.json.message).toBe(TARGET_NOT_FOUND_MESSAGE)
    expect(mockFetch.calls).toHaveLength(0)
    expect(await sqliteOf(db).select().from(webmentionInbox)).toHaveLength(0)
  })
})

describe('integration / public.webmentions.receive — receive switch (G5)', () => {
  it('answers the captured disabled envelope and enqueues nothing when receiving is disabled', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      webmentions: { webmention: { receiveEnabled: false, displayOnPosts: true } },
    })
    await seedLivePost('wm-target')
    const res = await callReceive({ source: SOURCE, target: 'https://example.com/posts/wm-target' })
    expect(res.status).toBe(200)
    const answer = await parseRpcJson<{ kind: string; message: string }>(res)
    expect(answer).toEqual({ kind: 'disabled', message: DISABLED_MESSAGE })
    expect(mockFetch.calls).toHaveLength(0)
    expect((await sqliteOf(db).select().from(webmentionInbox)).length).toBe(0)
  })

  it('answers NOT_FOUND when the settings bundle is missing (no site exists yet)', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await callReceive({ source: SOURCE, target: 'https://example.com/posts/wm-target' })
    expect(res.status).toBe(404)
    const envelope = (await res.json()) as { json: { code: string; message: string } }
    expect(envelope.json.code).toBe('NOT_FOUND')
    expect(envelope.json.message).toBe(TARGET_NOT_FOUND_MESSAGE)
    expect((await sqliteOf(db).select().from(webmentionInbox)).length).toBe(0)
  })
})

describe('integration / public.webmentions.receive — rate limits', () => {
  it('rate-limits repeated mentions from the same address through the webmention bucket', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        resource: { windowSeconds: 60, maxAttempts: 1 },
      },
    })
    await seedLivePost('wm-target')
    expect((await callReceive({ source: SOURCE, target: 'https://example.com/posts/wm-target' })).status).toBe(200)
    const res = await callReceive({ source: SOURCE, target: 'https://example.com/posts/wm-target' })
    expect(res.status).toBe(429)
    const envelope = (await res.json()) as { json: { code: string; message: string } }
    expect(envelope.json.code).toBe('TOO_MANY_REQUESTS')
    expect(envelope.json.message).toBe(RATE_LIMITED_MESSAGE)
  })

  it('rate-limits per visitor address, not per process', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        resource: { windowSeconds: 60, maxAttempts: 1 },
      },
    })
    await seedLivePost('wm-target')
    expect((await callReceive({ source: SOURCE, target: 'https://example.com/posts/wm-target' })).status).toBe(200)
    expect(
      (await callReceive({ source: SOURCE, target: 'https://example.com/posts/wm-target' }, '203.0.113.99')).status,
    ).toBe(200)
  })

  it('backpressures a flooded source host while other hosts still enqueue', async () => {
    await seedLivePost('wm-target')
    for (let i = 0; i < INBOX_MAX_QUEUED_PER_SOURCE_HOST; i++) {
      await upsertWebmentionInbox(db, {
        sourceUrl: `https://spam.example/p${i}`,
        targetUrl: 'https://example.com/posts/wm-target/',
      })
    }

    expect(
      (await callReceive({ source: 'https://spam.example/new', target: 'https://example.com/posts/wm-target' })).status,
    ).toBe(429)
    expect((await callReceive({ source: SOURCE, target: 'https://example.com/posts/wm-target' })).status).toBe(200)
  })
})
