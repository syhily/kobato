import { APP_VERSION } from '@kobato/base/distribution/app'
import { sqliteOf } from '@kobato/db/sqlite/database'
import { liveEntityWhere } from '@kobato/db/sqlite/operations/content/entity-meta'
import { content } from '@kobato/db/sqlite/schema/content'
import { page } from '@kobato/db/sqlite/schema/page'
import { post } from '@kobato/db/sqlite/schema/post'
import { countEntryFiles } from '@kobato/server/infra/cache/file-store'
import { __resetCacheCountersForTests, bumpCounter, getCounter, set } from '@kobato/server/infra/cache/registry'
import { scheduleRegisteredJob } from '@kobato/server/infra/job-registry'
import { stopAllScheduledJobs } from '@kobato/server/infra/scheduler-utils'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { lexicalBodyWith, lexicalParagraph } from '@kobato/server/tests/utils/lexical'
import { makeAuthedCtx } from '@kobato/server/tests/utils/mock-ctx'
import { callRpc, parseRpcJson } from '@kobato/server/tests/utils/rpc-call'
import { getBlogSettingsBundleSync, getBlogSettingsSnapshotSync } from '@kobato/settings/getters'
import { representationRevisionsFor } from '@kobato/settings/representation-scopes'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = getTestDb()

const HOUR_MS = 3_600_000

let seq = 0

async function seedScheduledPost(publishedAt: Date): Promise<number> {
  const key = ++seq
  const [meta] = await sqliteOf(db)
    .insert(post)
    .values({ slug: `post-${key}`, title: `Post ${key}` })
    .returning({ id: post.id })
  const [rev] = await sqliteOf(db)
    .insert(content)
    .values({ type: 'post', ownerId: meta.id, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: content.id })
  await sqliteOf(db).update(post).set({ publishedRevisionId: rev.id, publishedAt }).where(eq(post.id, meta.id))
  return meta.id
}

async function seedScheduledPage(publishedAt: Date): Promise<number> {
  const key = ++seq
  const [meta] = await sqliteOf(db)
    .insert(page)
    .values({ slug: `page-${key}`, title: `Page ${key}` })
    .returning({ id: page.id })
  const [rev] = await sqliteOf(db)
    .insert(content)
    .values({ type: 'page', ownerId: meta.id, revisionNo: 1, status: 'published', body: [] })
    .returning({ id: content.id })
  await sqliteOf(db).update(page).set({ publishedRevisionId: rev.id, publishedAt }).where(eq(page.id, meta.id))
  return meta.id
}

function warmFeed(): Promise<void> {
  return set(
    'feed',
    { scope: 'all', locale: 'zh-CN', version: APP_VERSION, settingsRevision: getBlogSettingsSnapshotSync().revision },
    ['stale'],
  )
}

function feedRowCount(): Promise<number> {
  return countEntryFiles('feed')
}

function sitemapRowCount(): Promise<number> {
  return countEntryFiles('sitemap')
}

beforeEach(async () => {
  vi.useFakeTimers()
  stopAllScheduledJobs()
  await clearAllTables(db)
  __resetCacheCountersForTests()
})

afterEach(() => {
  stopAllScheduledJobs()
  vi.useRealTimers()
})

describe('scheduled-publish job', () => {
  it('invalidates the public caches when the scheduled publishedAt arrives', async () => {
    const publishedAt = new Date(Date.now() + HOUR_MS)
    await seedScheduledPost(publishedAt)
    await warmFeed()
    bumpCounter('searchResult')
    const generationBefore = await getCounter('searchResult')

    scheduleRegisteredJob('content.scheduled-publish')

    await vi.advanceTimersByTimeAsync(HOUR_MS - 60_000)
    expect(await feedRowCount()).toBe(1)
    expect(sqliteOf(db).select().from(post).where(liveEntityWhere(post)).all()).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(await feedRowCount()).toBe(0)
    expect(await getCounter('searchResult')).toBe(generationBefore + 1)
    expect(sqliteOf(db).select().from(post).where(liveEntityWhere(post)).all()).toHaveLength(1)
  })

  it('re-arms to the next scheduled row after firing', async () => {
    await seedScheduledPost(new Date(Date.now() + HOUR_MS))
    await seedScheduledPost(new Date(Date.now() + 2 * HOUR_MS))
    await warmFeed()

    scheduleRegisteredJob('content.scheduled-publish')

    await vi.advanceTimersByTimeAsync(HOUR_MS)
    expect(await feedRowCount()).toBe(0)

    await warmFeed()
    expect(await feedRowCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(HOUR_MS)
    expect(await feedRowCount()).toBe(0)
  })

  it('stays suspended with nothing scheduled — caches are left alone', async () => {
    await warmFeed()
    scheduleRegisteredJob('content.scheduled-publish')

    expect(vi.getTimerCount()).toBeGreaterThan(0)
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(await feedRowCount()).toBe(1)
  })

  it('invalidates for a scheduled page too (sitemap surface)', async () => {
    await seedScheduledPage(new Date(Date.now() + HOUR_MS))
    await set(
      'sitemap',
      { settingsRevision: representationRevisionsFor(getBlogSettingsBundleSync()).sitemap },
      '<xml>stale</xml>',
    )

    scheduleRegisteredJob('content.scheduled-publish')
    expect(await sitemapRowCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(HOUR_MS)
    expect(await sitemapRowCount()).toBe(0)
  })

  it('a meta update that moves the schedule earlier re-arms the timer', async () => {
    const postId = await seedScheduledPost(new Date(Date.now() + 2 * HOUR_MS))
    scheduleRegisteredJob('content.scheduled-publish')

    const ctx = makeAuthedCtx({ role: 'admin', db })
    const res = await callRpc(
      '/admin/posts/upsertMeta',
      { id: String(postId), title: 'Post', publishedAt: new Date(Date.now() + HOUR_MS).toISOString() },
      ctx,
    )
    expect(res.status).toBe(200)

    await warmFeed()
    await vi.advanceTimersByTimeAsync(HOUR_MS)
    expect(await feedRowCount()).toBe(0)
  })

  it('cancelling the schedule (publishedAt: null) disarms the pending fire', async () => {
    const postId = await seedScheduledPost(new Date(Date.now() + HOUR_MS))
    scheduleRegisteredJob('content.scheduled-publish')

    const ctx = makeAuthedCtx({ role: 'admin', db })
    const res = await callRpc('/admin/posts/upsertMeta', { id: String(postId), title: 'Post', publishedAt: null }, ctx)
    expect(res.status).toBe(200)

    await warmFeed()
    await vi.advanceTimersByTimeAsync(2 * HOUR_MS)
    expect(await feedRowCount()).toBe(1)
  })

  it('publishing with a future publishedAt arms the timer', async () => {
    const ctx = makeAuthedCtx({ role: 'admin', db })
    const createRes = await callRpc('/admin/posts/upsertMeta', { title: 'Scheduled Post', tags: [] }, ctx)
    expect(createRes.status).toBe(200)
    const { post: created } = await parseRpcJson<{ post: { id: string } }>(createRes)

    scheduleRegisteredJob('content.scheduled-publish')

    const publishRes = await callRpc(
      '/admin/posts/publishLatest',
      {
        id: created.id,
        body: lexicalBodyWith([lexicalParagraph('scheduled')]),
        publishedAt: new Date(Date.now() + HOUR_MS).toISOString(),
      },
      ctx,
    )
    expect(publishRes.status).toBe(200)

    await warmFeed()
    await vi.advanceTimersByTimeAsync(HOUR_MS)
    expect(await feedRowCount()).toBe(0)
  })
})
