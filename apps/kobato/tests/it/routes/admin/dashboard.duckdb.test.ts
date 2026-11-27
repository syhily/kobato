import type { AnalyticsHandle } from '@kobato/db/duckdb/connection'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { comment as commentTable } from '@kobato/db/sqlite/schema/comment'
import { post as postTable } from '@kobato/db/sqlite/schema/post'
import {
  __adoptAnalyticsHandleForTests,
  __resetAnalyticsEngineForTests,
} from '@kobato/server/bootstrap/analytics-lifecycle'
import {
  clearAccessEvents,
  closeTestAnalyticsDb,
  createTestAnalyticsDb,
  seedAccessEvents,
} from '@kobato/server/tests/utils/analytics-db'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { adminSession, authorSession } from '@kobato/server/tests/utils/session'
import { EMPTY_STATE_LINE_IDS } from '@kobato/web-admin/ui/dashboard/empty-state-lines'
import { stubRouteRequestContext } from '@tests/utils/orpc-client-mock'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@kobato/api/browser/client', async () => {
  const { createOrpcClientMockModule } = await import('@tests/utils/orpc-client-mock')
  return createOrpcClientMockModule()
})

const db = getTestDb()

const CSRF_TOKEN = 'dashboard-duckdb-csrf-token'

function bootstrapSession(session: ReturnType<typeof adminSession>): ReturnType<typeof adminSession> {
  session.set('csrfToken', CSRF_TOKEN)
  return session
}

function clientLoaderArgs(session: ReturnType<typeof adminSession>) {
  stubRouteRequestContext({ session, db })
  return { request: new Request('http://localhost/admin') } as never
}

const analyticsHandle: AnalyticsHandle = await createTestAnalyticsDb()
__adoptAnalyticsHandleForTests(analyticsHandle)

const { clientLoader } = await import('@kobato/web-admin/routes/admin/dashboard')

beforeEach(async () => {
  await clearAllTables(db)
  await clearAccessEvents(analyticsHandle)
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
  const rows = await sqliteOf(db)
    .insert(postTable)
    .values({
      slug: `post-${Math.random().toString(36).slice(2)}`,
      title: overrides.title,
      authorId,

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
  await sqliteOf(db)
    .insert(commentTable)
    .values({
      type: 'post',
      ownerId: 1,
      userId,
      content: 'hello',
      ...overrides,
    })
}

async function seedVisits(): Promise<void> {
  const ts = new Date(Date.now() - 10_000)
  await seedAccessEvents(analyticsHandle, [
    { ts, visitorHash: 'a', path: '/', refererHost: 'google.com', country: 'US' },
    { ts, visitorHash: 'a', path: '/post/hello', country: 'US' },
    { ts, visitorHash: 'b', path: '/post/world', country: 'US' },
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

    const data = await clientLoader(clientLoaderArgs(bootstrapSession(adminSession())))

    expect(data.name).toBe('admin')
    expect(data.role).toBe('admin')

    expect(data.pendingModeration).toEqual({
      items: [],
      total: 0,
      hasMore: false,
      counts: { all: 0, approval: 0, deletion: 0 },
    })

    expect(data.visitSummary).toEqual({ visits: 3, visitors: 2, referers: 1 })
    expect(data.weeklyTrend).not.toBeNull()
    expect(data.weeklyTrend!.points.length).toBeGreaterThan(0)
    expect(data.weeklyTrend!.points.reduce((sum, point) => sum + point.visits, 0)).toBe(3)
    expect(EMPTY_STATE_LINE_IDS).toContain(data.emptyStateLineId)
    expect(data.stats).toEqual({ draftCount: 2, publishedCount: 1, myCommentsTotal: 2, myCommentsPending: 0 })

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

    await seedPost(1, { title: 'Admin Draft', draft: true, updatedAt: new Date('2024-02-04T00:00:00.000Z') })
    await seedComment(1)
    await seedVisits()

    const data = await clientLoader(clientLoaderArgs(bootstrapSession(authorSession())))

    expect(data.role).toBe('author')

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

  it('redirects anonymous viewers to the signin surface', async () => {
    const anonymous = bootstrapSession(adminSession())
    anonymous.unset('user')
    await expect(clientLoader(clientLoaderArgs(anonymous))).rejects.toMatchObject({ status: 302 })
  })
})
