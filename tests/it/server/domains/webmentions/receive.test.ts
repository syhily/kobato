import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { installFetch } from '#/_helpers/fetch'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { receiveWebmention } from '@/server/domains/webmentions/service'
import { post } from '@/server/infra/db/schema/post'
import { webmention } from '@/server/infra/db/schema/webmention'

// Notification seam only: WHEN to notify (R11 rules); the email mapping is covered by its unit suite.
vi.mock('@/server/domains/webmentions/email', () => ({
  sendNewWebmention: vi.fn(async () => ({ ok: true })),
}))

const { sendNewWebmention } = await import('@/server/domains/webmentions/email')

const db = getTestDb()
const mockFetch = installFetch()

const TARGET = 'https://example.com/posts/wm-target'
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

function enqueueSource(source: string) {
  mockFetch.enqueue(source, new Response(linkingHtml(TARGET), { status: 200 }))
}

async function receive(source: string) {
  return receiveWebmention(db, { source, target: TARGET })
}

beforeEach(async () => {
  await clearAllTables(db)
  mockFetch.reset()
  globalThis.fetch = mockFetch.fetch as unknown as typeof globalThis.fetch
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  vi.mocked(sendNewWebmention).mockClear()
})

describe('integration / receiveWebmention — source key convergence (R12)', () => {
  it('folds fragment / trailing-slash / default-port source variants into one row', async () => {
    await seedLivePost('wm-target')
    for (const source of [
      'https://sender.example/post',
      'https://sender.example/post#comments',
      'https://sender.example/post/',
      'https://sender.example:443/post',
    ]) {
      enqueueSource(source)
      const res = await receive(source)
      expect(res.row.sourceUrl).toBe('https://sender.example/post')
    }
    expect(await db.select().from(webmention)).toHaveLength(1)
    // Only the first (inserted) mention notifies; the rest are pending refreshes.
    expect(vi.mocked(sendNewWebmention)).toHaveBeenCalledTimes(1)
  })

  it('keeps scheme and query differences as distinct rows', async () => {
    await seedLivePost('wm-target')
    enqueueSource('https://sender.example/post')
    await receive('https://sender.example/post')
    enqueueSource('http://sender.example/post')
    await receive('http://sender.example/post')
    enqueueSource('https://sender.example/post?utm_source=x')
    await receive('https://sender.example/post?utm_source=x')

    const rows = await db.select().from(webmention)
    expect(rows).toHaveLength(3)
    expect(vi.mocked(sendNewWebmention)).toHaveBeenCalledTimes(3)
  })
})

describe('integration / receiveWebmention — response type classification (Phase 2)', () => {
  it('stores the mf2 marker type detected on the source anchor', async () => {
    await seedLivePost('wm-target')
    const cases: Array<[marker: string, expected: string]> = [
      ['u-in-reply-to', 'reply'],
      ['u-like-of', 'like'],
      ['u-repost-of', 'repost'],
    ]
    for (const [marker, expected] of cases) {
      const source = `https://sender.example/${expected}`
      mockFetch.enqueue(
        source,
        new Response(`<html><body><a class="${marker}" href="${TARGET}">response</a></body></html>`, { status: 200 }),
      )
      const res = await receive(source)
      expect(res.row.type).toBe(expected)
    }
  })

  it('defaults to mention without markers, and refreshes the type on a re-mention', async () => {
    await seedLivePost('wm-target')
    enqueueSource('https://sender.example/post')
    const first = await receive('https://sender.example/post')
    expect(first.row.type).toBe('mention')

    // The author re-sends as a reply — same pair, new classification.
    mockFetch.enqueue(
      'https://sender.example/post',
      new Response(`<html><body><a class="u-in-reply-to" href="${TARGET}">reply</a></body></html>`, { status: 200 }),
    )
    const second = await receive('https://sender.example/post')
    expect(second.row.id).toBe(first.row.id)
    expect(second.row.type).toBe('reply')
    expect(await db.select().from(webmention)).toHaveLength(1)
  })
})

describe('integration / receiveWebmention — notification rules (R11/R14)', () => {
  it('notifies again with the updated flag when an approved mention demotes', async () => {
    await seedLivePost('wm-target')
    enqueueSource('https://sender.example/post')
    const first = await receive('https://sender.example/post')
    expect(first.outcome).toBe('inserted')

    // Approve, then the source author edits and re-sends.
    const { setWebmentionStatus } = await import('@/server/infra/db/operations/webmention')
    await setWebmentionStatus(db, first.row.id, 'approved')

    enqueueSource('https://sender.example/post')
    const second = await receive('https://sender.example/post')
    expect(second.outcome).toBe('demoted')

    const rows = await db.select().from(webmention)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('pending')

    const calls = vi.mocked(sendNewWebmention).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls[0]![2]).toEqual({ updated: false })
    expect(calls[1]![2]).toEqual({ updated: true })
  })

  it('stays silent when a rejected mention is re-sent', async () => {
    await seedLivePost('wm-target')
    enqueueSource('https://sender.example/post')
    const first = await receive('https://sender.example/post')
    const { setWebmentionStatus } = await import('@/server/infra/db/operations/webmention')
    await setWebmentionStatus(db, first.row.id, 'rejected')

    enqueueSource('https://sender.example/post')
    const second = await receive('https://sender.example/post')
    expect(second.outcome).toBe('updated')

    const rows = await db.select().from(webmention)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('rejected')
    // One notification total — the initial insert; the rejected re-send is silent.
    expect(vi.mocked(sendNewWebmention)).toHaveBeenCalledTimes(1)
  })
})
