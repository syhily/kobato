import { beforeEach, describe, expect, it } from 'vitest'

import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'
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

async function createAndPublish(title: string, body: unknown[]) {
  const ctx = makeAuthedCtx({ role: 'admin', db })
  const createRes = await callRpc('/admin/posts/upsertMeta', { title, summary: '', tags: [] }, ctx)
  expect(createRes.status).toBe(200)
  const { post } = await parseRpcJson<{ post: { id: string } }>(createRes)
  const publishRes = await callRpc('/admin/posts/publishLatest', { id: post.id, body }, ctx)
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
      { id, body: bodyWithLinks('b2', ['https://ext.dev/kept', 'https://ext.dev/new']) },
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
