import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.useFakeTimers()

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'
import { scheduleNextScheduledPublish } from '@/server/domains/content/scheduled-publish'
import { livePostWhere } from '@/server/domains/posts/live-gate'
import { __resetCacheCountersForTests, bumpCounter, getCounter, set } from '@/server/infra/cache/registry'
import { content } from '@/server/infra/db/schema/content'
import { kvCache } from '@/server/infra/db/schema/kv-cache'
import { page } from '@/server/infra/db/schema/page'
import { post } from '@/server/infra/db/schema/post'
import { stopAllScheduledJobs } from '@/server/infra/scheduler-utils'

// The scheduled-publish job against the real engine: real post/page rows
// feed the next-due query, and the observable effect is the real
// content-invalidation — kv_cache buckets cleared, `searchResult`
// generation bumped. db-lifecycle (pulled in by the test-db helper) is
// the composition root that wires the scheduler's db getter, so only
// `scheduleNextScheduledPublish()` is called explicitly, like server.ts.
const db = getTestDb()

const HOUR_MS = 3_600_000

let seq = 0

/** A promoted post (published, published revision attached) scheduled for `publishedAt`. */
async function seedScheduledPost(publishedAt: Date): Promise<number> {
  const key = ++seq
  const [meta] = await db
    .insert(post)
    .values({ slug: `post-${key}`, title: `Post ${key}` })
    .returning({ id: post.id })
  const [rev] = await db
    .insert(content)
    .values({ type: 'post', ownerId: meta.id, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: content.id })
  await db.update(post).set({ publishedRevisionId: rev.id, publishedAt }).where(eq(post.id, meta.id))
  return meta.id
}

/** A promoted page scheduled for `publishedAt`. */
async function seedScheduledPage(publishedAt: Date): Promise<number> {
  const key = ++seq
  const [meta] = await db
    .insert(page)
    .values({ slug: `page-${key}`, title: `Page ${key}` })
    .returning({ id: page.id })
  const [rev] = await db
    .insert(content)
    .values({ type: 'page', ownerId: meta.id, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: content.id })
  await db.update(page).set({ publishedRevisionId: rev.id, publishedAt }).where(eq(page.id, meta.id))
  return meta.id
}

function warmFeed(): Promise<void> {
  return set(db, 'feed', { scope: 'all' }, ['stale'])
}

/**
 * Row-level assertion: TTL expiry also makes `get` miss (fake timers
 * advance past the feed TTL), but only `invalidateContent`'s bucket
 * clear DELETES the row — the exact effect under test.
 */
// Sync (node:sqlite).
function feedRowCount(): number {
  return db.select().from(kvCache).where(eq(kvCache.bucket, 'feed')).all().length
}

/**
 * Row-level sitemap assertion (see feedRowCount).
 */
// Sync (node:sqlite).
function sitemapRowCount(): number {
  return db.select().from(kvCache).where(eq(kvCache.bucket, 'sitemap')).all().length
}

beforeEach(async () => {
  stopAllScheduledJobs()
  await clearAllTables(db)
  __resetCacheCountersForTests()
})

afterEach(() => {
  stopAllScheduledJobs()
})

describe('scheduled-publish job', () => {
  it('invalidates the public caches when the scheduled publishedAt arrives', async () => {
    const publishedAt = new Date(Date.now() + HOUR_MS)
    await seedScheduledPost(publishedAt)
    await warmFeed()
    bumpCounter(db, 'searchResult')
    const generationBefore = await getCounter(db, 'searchResult')

    scheduleNextScheduledPublish()

    // Before the due time: nothing fires, the public gate still hides the row.
    await vi.advanceTimersByTimeAsync(HOUR_MS - 60_000)
    expect(feedRowCount()).toBe(1)
    expect(db.select().from(post).where(livePostWhere()).all()).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(feedRowCount()).toBe(0)
    expect(await getCounter(db, 'searchResult')).toBe(generationBefore + 1)
    // …and the row is publicly visible under the live gate now.
    expect(db.select().from(post).where(livePostWhere()).all()).toHaveLength(1)
  })

  it('re-arms to the next scheduled row after firing', async () => {
    await seedScheduledPost(new Date(Date.now() + HOUR_MS))
    await seedScheduledPost(new Date(Date.now() + 2 * HOUR_MS))
    await warmFeed()

    scheduleNextScheduledPublish()

    await vi.advanceTimersByTimeAsync(HOUR_MS)
    expect(feedRowCount()).toBe(0)

    // The second row re-armed the timer: its due time invalidates again.
    await warmFeed()
    expect(feedRowCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(HOUR_MS)
    expect(feedRowCount()).toBe(0)
  })

  it('stays suspended with nothing scheduled — caches are left alone', async () => {
    await warmFeed()
    scheduleNextScheduledPublish()

    expect(vi.getTimerCount()).toBeGreaterThan(0)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(feedRowCount()).toBe(1)
  })

  it('invalidates for a scheduled page too (sitemap surface)', async () => {
    await seedScheduledPage(new Date(Date.now() + HOUR_MS))
    await set(db, 'sitemap', {}, '<xml>stale</xml>')

    scheduleNextScheduledPublish()
    expect(sitemapRowCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(HOUR_MS)
    expect(sitemapRowCount()).toBe(0)
  })

  it('a meta update that moves the schedule earlier re-arms the timer', async () => {
    const postId = await seedScheduledPost(new Date(Date.now() + 2 * HOUR_MS))
    scheduleNextScheduledPublish()

    const ctx = makeAuthedCtx({ role: 'admin', db })
    const res = await callRpc(
      '/admin/posts/upsertMeta',
      { id: String(postId), title: 'Post', publishedAt: new Date(Date.now() + HOUR_MS).toISOString() },
      ctx,
    )
    expect(res.status).toBe(200)

    // The update of a promoted post invalidated once already; re-warm and
    // prove the re-armed timer fires at the EARLIER time.
    await warmFeed()
    await vi.advanceTimersByTimeAsync(HOUR_MS)
    expect(feedRowCount()).toBe(0)
  })

  it('cancelling the schedule (publishedAt: null) disarms the pending fire', async () => {
    const postId = await seedScheduledPost(new Date(Date.now() + HOUR_MS))
    scheduleNextScheduledPublish()

    const ctx = makeAuthedCtx({ role: 'admin', db })
    const res = await callRpc('/admin/posts/upsertMeta', { id: String(postId), title: 'Post', publishedAt: null }, ctx)
    expect(res.status).toBe(200)

    await warmFeed()
    await vi.advanceTimersByTimeAsync(2 * HOUR_MS)
    expect(feedRowCount()).toBe(1)
  })

  it('publishing with a future publishedAt arms the timer', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })
    const createRes = await callRpc('/admin/posts/upsertMeta', { title: 'Scheduled Post', tags: [] }, ctx)
    expect(createRes.status).toBe(200)
    const { post: created } = await parseRpcJson<{ post: { id: string } }>(createRes)

    // Job started (suspended: nothing scheduled yet) — the publish below
    // must re-arm it through the content lifecycle's nudge.
    scheduleNextScheduledPublish()

    const publishRes = await callRpc(
      '/admin/posts/publishLatest',
      {
        id: created.id,
        body: [
          {
            _type: 'block',
            _key: 'b1',
            style: 'normal',
            children: [{ _type: 'span', _key: 's1', text: 'scheduled', marks: [] }],
          },
        ],
        publishedAt: new Date(Date.now() + HOUR_MS).toISOString(),
      },
      ctx,
    )
    expect(publishRes.status).toBe(200)

    await warmFeed()
    await vi.advanceTimersByTimeAsync(HOUR_MS)
    expect(feedRowCount()).toBe(0)
  })
})
