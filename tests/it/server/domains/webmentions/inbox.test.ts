import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { installFetch } from '#/_helpers/fetch'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { processWebmentionInboxRow, runWebmentionInboxBatch } from '@/server/domains/webmentions/inbox'
import {
  listWebmentionInbox,
  markWebmentionInboxRetry,
  upsertWebmentionInbox,
} from '@/server/infra/db/operations/webmention-inbox'
import { post } from '@/server/infra/db/schema/post'
import { webmention } from '@/server/infra/db/schema/webmention'

// Capture the notification seam: the worker drives receiveWebmention,
// whose R11 rules decide WHEN to notify.
vi.mock('@/server/domains/webmentions/email', () => ({
  sendNewWebmention: vi.fn(async () => ({ ok: true })),
}))

const { sendNewWebmention } = await import('@/server/domains/webmentions/email')

const db = getTestDb()
const mockFetch = installFetch()

const SOURCE = 'https://sender.example/blog/mentioning-post'
const TARGET = 'https://example.com/posts/wm-target/'
const linkingHtml = (href: string) =>
  `<html><head><title>Mentioning post</title><meta name="author" content="Jane Doe"></head>` +
  `<body><p>I wrote about <a href="${href}">this post</a>.</p></body></html>`

async function seedLivePost(slug: string): Promise<number> {
  const rows = await db
    .insert(post)
    .values({ slug, title: 'Mentioned Post', published: true, publishedRevisionId: 1 })
    .returning({ id: post.id })
  return rows[0]!.id
}

async function enqueue(source = SOURCE, target = TARGET): Promise<void> {
  await upsertWebmentionInbox(db, { sourceUrl: source, targetUrl: target })
}

beforeEach(async () => {
  await clearAllTables(db)
  mockFetch.reset()
  globalThis.fetch = mockFetch.fetch as unknown as typeof globalThis.fetch
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  vi.mocked(sendNewWebmention).mockClear()
})

describe('integration / upsertWebmentionInbox (queue dedup)', () => {
  it('folds a repeat POST into the queued row and resets its retry bookkeeping', async () => {
    await enqueue()
    const [first] = await listWebmentionInbox(db)
    await markWebmentionInboxRetry(db, first!.id, 2, new Date(Date.now() + 60_000), 'boom')

    await enqueue()

    const rows = await listWebmentionInbox(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(first!.id)
    expect(rows[0]!.attempts).toBe(0)
    expect(rows[0]!.nextRetryAt).toBeNull()
    expect(rows[0]!.lastError).toBeNull()
  })
})

describe('integration / webmention inbox worker', () => {
  it('verifies a queued pair, lands the mention pending, and deletes the queue row', async () => {
    await seedLivePost('wm-target')
    await enqueue()
    mockFetch.enqueue(SOURCE, new Response(linkingHtml('https://example.com/posts/wm-target'), { status: 200 }))

    expect(await runWebmentionInboxBatch(db)).toBe(1)

    expect(await listWebmentionInbox(db)).toHaveLength(0)
    const rows = await db.select().from(webmention)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('pending')
    expect(rows[0]!.type).toBe('mention')
    expect(rows[0]!.verificationStatus).toBe('verified')
    expect(rows[0]!.verifyFailStreak).toBe(0)
    expect(rows[0]!.sourceUrl).toBe(SOURCE)
    expect(vi.mocked(sendNewWebmention)).toHaveBeenCalledTimes(1)
  })

  it('records a failed pending row when the source does not link to the target (terminal)', async () => {
    await seedLivePost('wm-target')
    await enqueue()
    mockFetch.enqueue(SOURCE, new Response('<html><body><p>No link at all.</p></body></html>', { status: 200 }))

    await runWebmentionInboxBatch(db)

    expect(await listWebmentionInbox(db)).toHaveLength(0)
    const rows = await db.select().from(webmention)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('pending')
    expect(rows[0]!.verificationStatus).toBe('failed')
    expect(rows[0]!.lastError).toBe('source does not link to target')
    expect(vi.mocked(sendNewWebmention)).not.toHaveBeenCalled()
  })

  it('records the blocked-host failure without fetching it', async () => {
    await seedLivePost('wm-target')
    await enqueue('http://127.0.0.1:8080/x')

    await runWebmentionInboxBatch(db)

    expect(mockFetch.calls).toHaveLength(0)
    expect(await listWebmentionInbox(db)).toHaveLength(0)
    const rows = await db.select().from(webmention)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.verificationStatus).toBe('failed')
    expect(rows[0]!.lastError).toBe('source URL points at a blocked host')
  })

  it('drops the row when the target vanished between enqueue and processing', async () => {
    await enqueue(SOURCE, 'https://example.com/posts/ghost/')

    await runWebmentionInboxBatch(db)

    expect(mockFetch.calls).toHaveLength(0)
    expect(await listWebmentionInbox(db)).toHaveLength(0)
    expect(await db.select().from(webmention)).toHaveLength(0)
  })

  it('records the failure on a permanent HTTP refusal (4xx), no retry', async () => {
    await seedLivePost('wm-target')
    await enqueue()
    mockFetch.enqueue(SOURCE, new Response('gone', { status: 404 }))

    await runWebmentionInboxBatch(db)

    const rows = await listWebmentionInbox(db)
    expect(rows).toHaveLength(0)
    const mentions = await db.select().from(webmention)
    expect(mentions).toHaveLength(1)
    expect(mentions[0]!.verificationStatus).toBe('failed')
    expect(mentions[0]!.lastError).toBe('source could not be fetched (HTTP 404)')
  })

  it('backs off a transient failure and records the failure once the attempt budget is spent', async () => {
    await seedLivePost('wm-target')
    await enqueue()
    mockFetch.enqueue(SOURCE, () => {
      throw new Error('simulated timeout')
    })

    await runWebmentionInboxBatch(db)

    let [row] = await listWebmentionInbox(db)
    expect(row).toBeDefined()
    expect(row!.attempts).toBe(1)
    expect(row!.nextRetryAt!.getTime()).toBeGreaterThan(Date.now())
    expect(row!.lastError).toContain('source could not be fetched')

    // Second and third failures: process the re-read row directly (its
    // attempts counter is what the budget decision reads). Each enqueue
    // is one-shot, so every attempt needs its own throwing responder.
    mockFetch.enqueue(SOURCE, () => {
      throw new Error('simulated timeout')
    })
    await processWebmentionInboxRow(db, row!)
    row = (await listWebmentionInbox(db))[0]
    expect(row!.attempts).toBe(2)

    mockFetch.enqueue(SOURCE, () => {
      throw new Error('simulated timeout')
    })
    await processWebmentionInboxRow(db, row!)
    expect(await listWebmentionInbox(db)).toHaveLength(0)
    const mentions = await db.select().from(webmention)
    expect(mentions).toHaveLength(1)
    expect(mentions[0]!.verificationStatus).toBe('failed')
    expect(mentions[0]!.lastError).toContain('source could not be fetched')
  })

  it('retries a 5xx and succeeds once the source recovers', async () => {
    await seedLivePost('wm-target')
    await enqueue()
    mockFetch.enqueue(SOURCE, new Response('server error', { status: 500 }))

    await runWebmentionInboxBatch(db)
    expect((await listWebmentionInbox(db))[0]!.attempts).toBe(1)

    // The sender re-POSTs (resetting the backoff), the source is back.
    await enqueue()
    mockFetch.enqueue(SOURCE, new Response(linkingHtml('https://example.com/posts/wm-target'), { status: 200 }))

    await runWebmentionInboxBatch(db)
    expect(await listWebmentionInbox(db)).toHaveLength(0)
    expect(await db.select().from(webmention)).toHaveLength(1)
  })

  it('drains the queue without fetching when receiving is switched off', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      webmentions: { webmention: { receiveEnabled: false, displayOnPosts: true } },
    })
    await enqueue()
    await enqueue(SOURCE, 'https://example.com/posts/other/')

    expect(await runWebmentionInboxBatch(db)).toBe(0)

    expect(mockFetch.calls).toHaveLength(0)
    expect(await listWebmentionInbox(db)).toHaveLength(0)
    expect(await db.select().from(webmention)).toHaveLength(0)
  })
})
