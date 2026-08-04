import type { PortableTextBody } from '@kobato/shared/legacy-pt/schema'

import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'

import { convertPtBodyToLexical } from '@kobato/editor/lexical-core/mapping'
import { enqueuePostWebmentionOutbox } from '@kobato/server/domains/webmentions/enqueue'
import { pickDueWebmentionOutbox } from '@kobato/server/infra/db/operations/webmention-outbox'
import { webmentionOutbox } from '@kobato/server/infra/db/schema/webmention'
import { beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  // The publish hook builds source URLs from siteIdentity.website.
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

function bodyWithLinks(key: string, hrefs: string[]): PortableTextBody {
  return [
    {
      _type: 'block',
      _key: key,
      style: 'normal',
      markDefs: hrefs.map((href, i) => ({ _type: 'link', _key: `${key}-l${i}`, href })),
      // One span per link — the one-way mapping keeps only the FIRST link
      // markDef of a span, so multi-link fixtures must split spans.
      children:
        hrefs.length > 0
          ? hrefs.map((_, i) => ({ _type: 'span', _key: `${key}-s-${i}`, text: 'published', marks: [`${key}-l${i}`] }))
          : [{ _type: 'span', _key: `${key}-s`, text: 'published', marks: [] }],
    },
  ]
}

async function createAndPublish(title: string, body: PortableTextBody) {
  const ctx = makeAuthedCtx({ role: 'admin', db })
  const createRes = await callRpc('/admin/posts/upsertMeta', { title, summary: '', tags: [] }, ctx)
  expect(createRes.status).toBe(200)
  const { post } = await parseRpcJson<{ post: { id: string } }>(createRes)
  const publishRes = await callRpc(
    '/admin/posts/publishLatest',
    { id: post.id, body: convertPtBodyToLexical(body) },
    ctx,
  )
  expect(publishRes.status).toBe(200)
  return post.id
}

describe('integration / webmention outbox enqueue on publish', () => {
  it('enqueues one pending row per external link in the published body', async () => {
    await createAndPublish(
      'Webmention Enqueue',
      bodyWithLinks('b1', [
        'https://external.dev/article#part',
        'https://external.dev/article/',
        'https://other.dev/x',
      ]),
    )

    const rows = await db.select().from(webmentionOutbox)
    // The first two hrefs normalize to the same URL (fragment + trailing
    // slash stripped) — one row, not two.
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
    await createAndPublish('Self Links', bodyWithLinks('b1', ['https://example.com/posts/other', 'https://ext.dev/y']))

    const rows = await db.select().from(webmentionOutbox)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.targetUrl).toBe('https://ext.dev/y')
  })

  it('does not enqueue on a meta-only update (no publish)', async () => {
    const id = await createAndPublish('Meta Update', bodyWithLinks('b1', ['https://ext.dev/original']))
    expect(await db.select().from(webmentionOutbox)).toHaveLength(1)

    const ctx = makeAuthedCtx({ role: 'admin', db })
    const metaRes = await callRpc(
      '/admin/posts/upsertMeta',
      { id, title: 'Meta Update Renamed', summary: '', tags: [] },
      ctx,
    )
    expect(metaRes.status).toBe(200)

    const rows = await db.select().from(webmentionOutbox)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.targetUrl).toBe('https://ext.dev/original')
  })

  it('dedups across republishes: sent rows stay, new links enqueue', async () => {
    const id = await createAndPublish('Republish', bodyWithLinks('b1', ['https://ext.dev/kept']))
    // Simulate the worker having delivered the first mention.
    await db.update(webmentionOutbox).set({ status: 'sent', endpoint: 'https://ext.dev/wm', sentAt: new Date() })

    await callRpc(
      '/admin/posts/publishLatest',
      { id, body: convertPtBodyToLexical(bodyWithLinks('b2', ['https://ext.dev/kept', 'https://ext.dev/new'])) },
      makeAuthedCtx({ role: 'admin', db }),
    )

    const rows = await db.select().from(webmentionOutbox)
    expect(rows).toHaveLength(2)
    const kept = rows.find((r) => r.targetUrl === 'https://ext.dev/kept')
    const added = rows.find((r) => r.targetUrl === 'https://ext.dev/new')
    expect(kept?.status).toBe('sent')
    expect(added?.status).toBe('pending')
  })
})

describe('integration / webmention outbox waterline for scheduled posts', () => {
  it('the RPC publish path with a future publishedAt pushes the waterline to the publish moment', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })
    const createRes = await callRpc('/admin/posts/upsertMeta', { title: 'RPC Scheduled', summary: '', tags: [] }, ctx)
    expect(createRes.status).toBe(200)
    const { post } = await parseRpcJson<{ post: { id: string } }>(createRes)

    const publishedAt = new Date(Date.now() + 3_600_000)
    const publishRes = await callRpc(
      '/admin/posts/publishLatest',
      {
        id: post.id,
        body: convertPtBodyToLexical(bodyWithLinks('b1', ['https://ext.dev/rpc-scheduled'])),
        publishedAt: publishedAt.toISOString(),
      },
      ctx,
    )
    expect(publishRes.status).toBe(200)

    const rows = await db.select().from(webmentionOutbox)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('pending')
    // The hook must see the publishedAt the publish transaction wrote, not
    // the pre-publish (NULL) one.
    expect(rows[0]!.nextRetryAt!.getTime()).toBe(publishedAt.getTime())
    expect(await pickDueWebmentionOutbox(db, new Date(), 10)).toHaveLength(0)
  })

  it('a future publishedAt pushes the waterline to the publish moment — the mention cannot fire early', async () => {
    const publishedAt = new Date(Date.now() + 3_600_000)
    const enqueued = await enqueuePostWebmentionOutbox(
      db,
      'scheduled-mention',
      convertPtBodyToLexical(bodyWithLinks('b1', ['https://ext.dev/scheduled']) as PortableTextBody),
      publishedAt,
    )
    expect(enqueued).toBe(1)

    const rows = await db.select().from(webmentionOutbox)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.status).toBe('pending')
    // The real delayUntil mapping: future publishedAt → waterline = publishedAt.
    expect(rows[0]!.nextRetryAt!.getTime()).toBe(publishedAt.getTime())

    // Not due now — the send must wait for the public moment …
    expect(await pickDueWebmentionOutbox(db, new Date(), 10)).toHaveLength(0)
    // … and it IS due at the publish moment.
    expect(await pickDueWebmentionOutbox(db, publishedAt, 10)).toHaveLength(1)
  })

  it('a past publishedAt stays send-now (NULL waterline)', async () => {
    const enqueued = await enqueuePostWebmentionOutbox(
      db,
      'backdated-mention',
      convertPtBodyToLexical(bodyWithLinks('b1', ['https://ext.dev/backdated']) as PortableTextBody),
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
      convertPtBodyToLexical(bodyWithLinks('b1', ['https://ext.dev/plain']) as PortableTextBody),
    )
    expect(enqueued).toBe(1)

    const rows = await db.select().from(webmentionOutbox)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.nextRetryAt).toBeNull()
  })

  it('a republish that moves the publish moment later raises the waterline through the real hook', async () => {
    const sooner = new Date(Date.now() + 3_600_000)
    const later = new Date(Date.now() + 7_200_000)
    const body = convertPtBodyToLexical(bodyWithLinks('b1', ['https://ext.dev/rescheduled']) as PortableTextBody)
    await enqueuePostWebmentionOutbox(db, 'rescheduled-mention', body, sooner)
    await enqueuePostWebmentionOutbox(db, 'rescheduled-mention', body, later)

    const rows = await db.select().from(webmentionOutbox)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.nextRetryAt!.getTime()).toBe(later.getTime())
    expect(await pickDueWebmentionOutbox(db, new Date(Date.now() + 3_600_000), 10)).toHaveLength(0)
  })
})
