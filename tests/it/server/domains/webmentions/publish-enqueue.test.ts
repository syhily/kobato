import { beforeEach, describe, expect, it } from 'vitest'

import type { PortableTextBody } from '@/shared/pt/schema'

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

function bodyWithLinks(key: string, hrefs: string[]) {
  return [
    {
      _type: 'block',
      _key: key,
      style: 'normal',
      markDefs: hrefs.map((href, i) => ({ _type: 'link', _key: `${key}-l${i}`, href })),
      children: [{ _type: 'span', _key: `${key}-s`, text: 'published', marks: hrefs.map((_, i) => `${key}-l${i}`) }],
    },
  ]
}

describe('integration / webmention outbox enqueue on publish', () => {
  it('enqueues one pending row per external link in the published body', async () => {
    const enqueued = await enqueuePostWebmentionOutbox(
      db,
      'webmention-enqueue',
      bodyWithLinks('b1', [
        'https://external.dev/article#part',
        'https://external.dev/article/',
        'https://other.dev/x',
      ]) as PortableTextBody,
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
      bodyWithLinks('b1', ['https://example.com/posts/other', 'https://ext.dev/y']) as PortableTextBody,
    )

    const rows = await db.select().from(webmentionOutbox)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.targetUrl).toBe('https://ext.dev/y')
  })

  it('dedups across republishes: sent rows stay, new links enqueue', async () => {
    await enqueuePostWebmentionOutbox(
      db,
      'republish',
      bodyWithLinks('b1', ['https://ext.dev/kept']) as PortableTextBody,
    )
    // Simulate the worker having delivered the first mention.
    await db.update(webmentionOutbox).set({ status: 'sent', endpoint: 'https://ext.dev/wm', sentAt: new Date() })

    await enqueuePostWebmentionOutbox(
      db,
      'republish',
      bodyWithLinks('b2', ['https://ext.dev/kept', 'https://ext.dev/new']) as PortableTextBody,
    )

    const rows = await db.select().from(webmentionOutbox)
    expect(rows).toHaveLength(2)
    const kept = rows.find((r) => r.targetUrl === 'https://ext.dev/kept')
    const added = rows.find((r) => r.targetUrl === 'https://ext.dev/new')
    expect(kept?.status).toBe('sent')
    expect(added?.status).toBe('pending')
  })

  // R9a interregnum: saveBody now stores a Lexical state and the posts
  // descriptor casts it for the still-PT publish-hook consumers. PT link
  // extraction cannot read the foreign shape, so a publish degrades the
  // hook to a warning instead of enqueueing. R14 switches
  // `extractExternalLinks` to Lexical traversal and restores the wiring
  // tests below to real enqueue assertions.
  it('the RPC publish path degrades the webmention hook to a warning instead of failing', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })
    const createRes = await callRpc('/admin/posts/upsertMeta', { title: 'Hook Degraded', summary: '', tags: [] }, ctx)
    expect(createRes.status).toBe(200)
    const { post } = await parseRpcJson<{ post: { id: string } }>(createRes)

    const publishRes = await callRpc(
      '/admin/posts/publishLatest',
      {
        id: post.id,
        body: lexicalBodyWith([
          {
            type: 'paragraph',
            version: 1,
            direction: 'ltr',
            format: '',
            indent: 0,
            children: [
              {
                type: 'link',
                version: 1,
                url: 'https://ext.dev/x',
                rel: 'noopener',
                target: '_blank',
                direction: 'ltr',
                format: '',
                indent: 0,
                children: [
                  { type: 'extended-text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: 'x' },
                ],
              },
            ],
          },
        ]),
      },
      ctx,
    )
    expect(publishRes.status).toBe(200)
    const payload = await parseRpcJson<{ status: string; warning?: string }>(publishRes)
    expect(payload.status).toBe('saved')
    expect(payload.warning).toBeDefined()

    // Nothing enqueued in the interregnum.
    expect(await db.select().from(webmentionOutbox)).toHaveLength(0)
  })

  it.skip('does not enqueue on a meta-only update (no publish) — R14 restores with Lexical link extraction', async () => {
    // Original wiring assertion: publish enqueues, upsertMeta does not.
  })

  it.skip('RPC waterline: a future publishedAt pushes the waterline to the publish moment — R14 restores', async () => {
    // Original assertion: the hook sees the publish transaction's publishedAt,
    // not the pre-publish NULL.
  })
})

describe('integration / webmention outbox waterline for scheduled posts', () => {
  it('a future publishedAt pushes the waterline to the publish moment — the mention cannot fire early', async () => {
    const publishedAt = new Date(Date.now() + 3_600_000)
    const enqueued = await enqueuePostWebmentionOutbox(
      db,
      'scheduled-mention',
      bodyWithLinks('b1', ['https://ext.dev/scheduled']) as PortableTextBody,
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
      bodyWithLinks('b1', ['https://ext.dev/backdated']) as PortableTextBody,
      new Date(Date.now() - 60_000),
    )
    expect(enqueued).toBe(1)

    const rows = await db.select().from(webmentionOutbox)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.nextRetryAt).toBeNull()
    expect(await pickDueWebmentionOutbox(db, new Date(), 10)).toHaveLength(1)
  })

  it('an omitted publishedAt stays send-now (NULL waterline)', async () => {
    const enqueued = await enqueuePostWebmentionOutbox(
      db,
      'plain-mention',
      bodyWithLinks('b1', ['https://ext.dev/plain']) as PortableTextBody,
    )
    expect(enqueued).toBe(1)

    const rows = await db.select().from(webmentionOutbox)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.nextRetryAt).toBeNull()
  })

  it('a republish that moves the publish moment later raises the waterline through the real hook', async () => {
    const sooner = new Date(Date.now() + 3_600_000)
    const later = new Date(Date.now() + 7_200_000)
    const body = bodyWithLinks('b1', ['https://ext.dev/rescheduled']) as PortableTextBody
    await enqueuePostWebmentionOutbox(db, 'rescheduled-mention', body, sooner)
    await enqueuePostWebmentionOutbox(db, 'rescheduled-mention', body, later)

    const rows = await db.select().from(webmentionOutbox)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.nextRetryAt!.getTime()).toBe(later.getTime())
    expect(await pickDueWebmentionOutbox(db, new Date(Date.now() + 3_600_000), 10)).toHaveLength(0)
  })
})
