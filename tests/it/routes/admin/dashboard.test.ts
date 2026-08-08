import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'

import { clearAccessLog, closeTestAnalyticsDb, createTestAnalyticsDb, seedAccessEvents } from '#/_helpers/analytics-db'
import { makeLoaderArgs } from '#/_helpers/context'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { adminSession, authorSession } from '#/_helpers/session'
import { __adoptAnalyticsHandleForTests, __resetAnalyticsEngineForTests } from '@/server/bootstrap/analytics-lifecycle'
import { comment as commentTable } from '@/server/infra/db/schema/comment'
import { post as postTable } from '@/server/infra/db/schema/post'
import { EMPTY_STATE_LINES } from '@/shared/contracts/dashboard'

// The dashboard loader against the real engine: real rows + the ADOPTED
// DuckDB sidecar; admin-only branches are pinned by their real results
// (null for authors), not behavioural assertions. No mocks.

const db = getTestDb()

const analyticsHandle: AnalyticsHandle = await createTestAnalyticsDb()
__adoptAnalyticsHandleForTests(analyticsHandle)

const { loader } = await import('@/routes/admin/dashboard')

beforeEach(async () => {
  await clearAllTables(db)
  await clearAccessLog(analyticsHandle)
})

afterAll(async () => {
  __resetAnalyticsEngineForTests()
  await closeTestAnalyticsDb(analyticsHandle)
})

async function seedPost(
  authorId: number,
  overrides: {
    title: string
    draft?: boolean
    updatedAt: Date
    publishedAt?: Date
  },
): Promise<number> {
  const draft = overrides.draft ?? false
  const rows = await db
    .insert(postTable)
    .values({
      slug: `post-${Math.random().toString(36).slice(2)}`,
      title: overrides.title,
      authorId,
      // Promoted = published flag + a published revision; drafts miss one of the two.
      published: !draft,
      publishedRevisionId: draft ? null : 1,
      updatedAt: overrides.updatedAt,
      publishedAt: overrides.publishedAt ?? overrides.updatedAt,
      visible: true,
    })
    .returning({ id: postTable.id })
  return rows[0]!.id
}

async function seedComment(userId: number, overrides: Record<string, unknown> = {}): Promise<void> {
  await db.insert(commentTable).values({
    type: 'post',
    ownerId: 1,
    userId,
    content: 'hello',
    ...overrides,
  })
}

/** Three views from two visitors (one referer) inside the loader's 24h window. */
async function seedVisits(): Promise<void> {
  const ts = new Date(Date.now() - 10_000)
  await seedAccessEvents(analyticsHandle, [
    { ts, visitorHash: 'a', path: '/', refererHost: 'google.com' },
    { ts, visitorHash: 'a', path: '/post/hello' },
    { ts, visitorHash: 'b', path: '/post/world' },
  ])
}

describe('admin dashboard loader (real db + real analytics)', () => {
  it('assembles the full payload for an admin, admin-only branches included', async () => {
    const draftId = await seedPost(1, {
      title: 'Draft A',
      draft: true,
      updatedAt: new Date('2024-02-01T00:00:00.000Z'),
    })
    await seedPost(1, { title: 'Draft B', draft: true, updatedAt: new Date('2024-01-15T00:00:00.000Z') })
    const publishedId = await seedPost(1, {
      title: 'Published B',
      updatedAt: new Date('2024-02-02T00:00:00.000Z'),
      publishedAt: new Date('2024-02-03T00:00:00.000Z'),
    })
    await seedComment(1)
    await seedComment(1)
    await seedVisits()

    const data = await loader(makeLoaderArgs({ session: adminSession(), db }))

    expect(data.name).toBe('admin')
    expect(data.role).toBe('admin')
    // Real moderation queue: nothing pending.
    expect(data.pendingModeration).toEqual({
      items: [],
      total: 0,
      hasMore: false,
      counts: { all: 0, approval: 0, deletion: 0 },
    })
    // Real counters over the seeded sidecar rows.
    expect(data.visitSummary).toEqual({ visits: 3, visitors: 2, referers: 1 })
    expect(data.weeklyTrend).not.toBeNull()
    expect(data.weeklyTrend!.length).toBeGreaterThan(0)
    expect(data.weeklyTrend!.reduce((sum, point) => sum + point.visits, 0)).toBe(3)
    expect(EMPTY_STATE_LINES).toContain(data.emptyStateLine)
    expect(data.stats).toEqual({ draftCount: 2, publishedCount: 1, myCommentsTotal: 2, myCommentsPending: 0 })
    // Draft cards sort by updatedAt desc; published cards prefer publishedAt.
    expect(data.recentDrafts).toEqual([
      { id: String(draftId), title: 'Draft A', updatedAtIso: '2024-02-01T00:00:00.000Z' },
      { id: expect.any(String), title: 'Draft B', updatedAtIso: '2024-01-15T00:00:00.000Z' },
    ])
    expect(data.recentPublished).toEqual([
      { id: String(publishedId), title: 'Published B', updatedAtIso: '2024-02-03T00:00:00.000Z' },
    ])
  })

  it('keeps the admin-only branches null for an author and scopes stats to their own rows', async () => {
    const draftId = await seedPost(3, {
      title: 'Author Draft',
      draft: true,
      updatedAt: new Date('2024-02-01T00:00:00.000Z'),
    })
    await seedPost(3, { title: 'Author Published', updatedAt: new Date('2024-02-02T00:00:00.000Z') })
    await seedComment(3)
    // Another user's rows must not leak into the author's numbers.
    await seedPost(1, { title: 'Admin Draft', draft: true, updatedAt: new Date('2024-02-04T00:00:00.000Z') })
    await seedComment(1)
    await seedVisits()

    const data = await loader(makeLoaderArgs({ session: authorSession(), db }))

    expect(data.role).toBe('author')
    // Admin-only branches are null for authors; the UI hides those cards.
    expect(data.pendingModeration).toBeNull()
    expect(data.visitSummary).toBeNull()
    expect(data.weeklyTrend).toBeNull()
    expect(data.stats).toEqual({ draftCount: 1, publishedCount: 1, myCommentsTotal: 1, myCommentsPending: 0 })
    expect(data.recentDrafts).toEqual([
      { id: String(draftId), title: 'Author Draft', updatedAtIso: '2024-02-01T00:00:00.000Z' },
    ])
    expect(data.recentPublished).toHaveLength(1)
    expect(data.recentPublished[0]!.title).toBe('Author Published')
  })

  it('rejects anonymous viewers', async () => {
    await expect(loader(makeLoaderArgs({ user: null, db }))).rejects.toMatchObject({ status: 403 })
  })
})
