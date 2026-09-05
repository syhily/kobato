import { beforeEach, describe, expect, it } from 'vitest'

import type { LexicalEditorState } from '@/shared/lexical/schema'

import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { lexicalBodyWith } from '#/_helpers/lexical'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'
import { enqueuePostWebmentionOutbox } from '@/server/domains/webmentions/enqueue'
import { pickDueWebmentionOutbox } from '@/server/infra/db/operations/webmention-outbox'
import { webmentionOutbox } from '@/server/infra/db/schema/webmention'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  // The publish hook builds source URLs from siteIdentity.website.
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

function linkNode(url: string) {
  return {
    type: 'link',
    version: 1,
    url,
    rel: null,
    target: null,
    direction: 'ltr',
    format: '',
    indent: 0,
    children: [{ type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'x' }],
  }
}

function bodyWithLinks(hrefs: string[]): LexicalEditorState {
  return lexicalBodyWith([
    {
      type: 'paragraph',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      children: hrefs.map((href) => linkNode(href)),
    },
  ])
}

describe('integration / webmention outbox enqueue on publish', () => {
  it('enqueues one pending row per external link in the published body', async () => {
    const enqueued = await enqueuePostWebmentionOutbox(
      db,
      'webmention-enqueue',
      bodyWithLinks(['https://external.dev/article#part', 'https://external.dev/article/', 'https://other.dev/x']),
    )
    expect(enqueued).toBe(2)

    const rows = await db.select().from(webmentionOutbox)
    // The first two hrefs normalize to one URL (fragment + trailing slash stripped).
    expect(rows).toHaveLength(2)
    const targets = rows.map((r) => r.targetUrl).sort()
    expect(targets).toEqual(['https://external.dev/article', 'https://other.dev/x'])
    for (const row of rows) {
      expect(row.sourceUrl).toBe('https://example.com/posts/webmention-enqueue/')
      expect(row.status).toBe('pending')
      expect(row.endpoint).toBeNull()
      expect(row.attempts).toBe(0)
    }
  })

  it('skips links back to the site itself', async () => {
    await enqueuePostWebmentionOutbox(
      db,
      'self-links',
      bodyWithLinks(['https://example.com/posts/other', 'https://ext.dev/y']),
    )

    const rows = await db.select().from(webmentionOutbox)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.targetUrl).toBe('https://ext.dev/y')
  })

  it('dedups across republishes: sent rows stay, new links enqueue', async () => {
    await enqueuePostWebmentionOutbox(db, 'republish', bodyWithLinks(['https://ext.dev/kept']))
    // Simulate the worker having delivered the first mention.
    await db.update(webmentionOutbox).set({ status: 'sent', endpoint: 'https://ext.dev/wm', sentAt: new Date() })

    await enqueuePostWebmentionOutbox(db, 'republish', bodyWithLinks(['https://ext.dev/kept', 'https://ext.dev/new']))

    const rows = await db.select().from(webmentionOutbox)
    expect(rows).toHaveLength(2)
    const kept = rows.find((r) => r.targetUrl === 'https://ext.dev/kept')
    const added = rows.find((r) => r.targetUrl === 'https://ext.dev/new')
    expect(kept?.status).toBe('sent')
    expect(added?.status).toBe('pending')
  })

  // R14: the publish hook extracts links from the Lexical state directly, so
  // the RPC publish path enqueues for real again (the R9a interregnum degraded
  // it to a warning).
  it('the RPC publish path enqueues the outbox rows for real', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })
    const createRes = await callRpc('/admin/posts/upsertMeta', { title: 'Hook Real', summary: '', tags: [] }, ctx)
    expect(createRes.status).toBe(200)
    const { post } = await parseRpcJson<{ post: { id: string } }>(createRes)

    const publishRes = await callRpc(
      '/admin/posts/publishLatest',
      { id: post.id, body: bodyWithLinks(['https://ext.dev/x']) },
      ctx,
    )
    expect(publishRes.status).toBe(200)
    const payload = await parseRpcJson<{ status: string; warning?: string }>(publishRes)
    expect(payload.status).toBe('saved')
    expect(payload.warning).toBeUndefined()

    const rows = await db.select().from(webmentionOutbox)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.targetUrl).toBe('https://ext.dev/x')
  })

  it('does not enqueue on a meta-only update (no publish)', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })
    const createRes = await callRpc('/admin/posts/upsertMeta', { title: 'Meta Only', summary: '', tags: [] }, ctx)
    expect(createRes.status).toBe(200)
    const { post } = await parseRpcJson<{ post: { id: string } }>(createRes)

    const publishRes = await callRpc(
      '/admin/posts/publishLatest',
      { id: post.id, body: bodyWithLinks(['https://ext.dev/meta']) },
      ctx,
    )
    expect(publishRes.status).toBe(200)
    expect(await db.select().from(webmentionOutbox)).toHaveLength(1)

    // A meta-only upsert touches no body, so no re-enqueue happens.
    const metaRes = await callRpc(
      '/admin/posts/upsertMeta',
      { id: post.id, title: 'Meta Only (renamed)', summary: '', tags: [] },
      ctx,
    )
    expect(metaRes.status).toBe(200)
    expect(await db.select().from(webmentionOutbox)).toHaveLength(1)
  })

  it('RPC waterline: a future publishedAt pushes the waterline to the publish moment', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })
    const createRes = await callRpc('/admin/posts/upsertMeta', { title: 'Scheduled', summary: '', tags: [] }, ctx)
    expect(createRes.status).toBe(200)
    const { post } = await parseRpcJson<{ post: { id: string } }>(createRes)

    const publishedAt = new Date(Date.now() + 3_600_000)
    const publishRes = await callRpc(
      '/admin/posts/publishLatest',
      {
        id: post.id,
        body: bodyWithLinks(['https://ext.dev/scheduled-rpc']),
        publishedAt: publishedAt.toISOString(),
      },
      ctx,
    )
    expect(publishRes.status).toBe(200)

    const rows = await db.select().from(webmentionOutbox)
    expect(rows).toHaveLength(1)
    // The hook saw the publish transaction's publishedAt, not the pre-publish NULL.
    expect(rows[0]!.nextRetryAt!.getTime()).toBe(publishedAt.getTime())
  })
})

describe('integration / webmention outbox waterline for scheduled posts', () => {
  it('a future publishedAt pushes the waterline to the publish moment — the mention cannot fire early', async () => {
    const publishedAt = new Date(Date.now() + 3_600_000)
    const enqueued = await enqueuePostWebmentionOutbox(
      db,
      'scheduled-mention',
      bodyWithLinks(['https://ext.dev/scheduled']),
      publishedAt,
    )
    expect(enqueued).toBe(1)

    const rows = await db.select().from(webmentionOutbox)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('pending')
    // The real delayUntil mapping: future publishedAt → waterline = publishedAt.
    expect(rows[0]!.nextRetryAt!.getTime()).toBe(publishedAt.getTime())

    // Not due now, but due exactly at the publish moment.
    expect(await pickDueWebmentionOutbox(db, new Date(), 10)).toHaveLength(0)
    expect(await pickDueWebmentionOutbox(db, publishedAt, 10)).toHaveLength(1)
  })

  it('a past publishedAt stays send-now (NULL waterline)', async () => {
    const enqueued = await enqueuePostWebmentionOutbox(
      db,
      'backdated-mention',
      bodyWithLinks(['https://ext.dev/backdated']),
      new Date(Date.now() - 60_000),
    )
    expect(enqueued).toBe(1)

    const rows = await db.select().from(webmentionOutbox)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.nextRetryAt).toBeNull()
    expect(await pickDueWebmentionOutbox(db, new Date(), 10)).toHaveLength(1)
  })

  it('an omitted publishedAt stays send-now (NULL waterline)', async () => {
    const enqueued = await enqueuePostWebmentionOutbox(db, 'plain-mention', bodyWithLinks(['https://ext.dev/plain']))
    expect(enqueued).toBe(1)

    const rows = await db.select().from(webmentionOutbox)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.nextRetryAt).toBeNull()
  })

  it('a republish that moves the publish moment later raises the waterline through the real hook', async () => {
    const sooner = new Date(Date.now() + 3_600_000)
    const later = new Date(Date.now() + 7_200_000)
    const body = bodyWithLinks(['https://ext.dev/rescheduled'])
    await enqueuePostWebmentionOutbox(db, 'rescheduled-mention', body, sooner)
    await enqueuePostWebmentionOutbox(db, 'rescheduled-mention', body, later)

    const rows = await db.select().from(webmentionOutbox)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.nextRetryAt!.getTime()).toBe(later.getTime())
    expect(await pickDueWebmentionOutbox(db, new Date(Date.now() + 3_600_000), 10)).toHaveLength(0)
  })
})
