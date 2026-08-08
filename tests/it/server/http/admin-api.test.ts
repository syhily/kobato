import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { AnalyticsHandle } from '@/server/infra/analytics/duckdb'

import { clearAccessLog, closeTestAnalyticsDb, createTestAnalyticsDb, seedAccessEvents } from '#/_helpers/analytics-db'
import {
  resetBlogSettingsForTests,
  setBlogSettingsBundleForTests,
  TEST_BLOG_SETTINGS_BUNDLE,
} from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'
import { callRpc, parseRpcJson } from '#/_helpers/rpc-call'
import { __adoptAnalyticsHandleForTests, __resetAnalyticsEngineForTests } from '@/server/bootstrap/analytics-lifecycle'
import { comment as commentTable } from '@/server/infra/db/schema/comment'
import { setting } from '@/server/infra/db/schema/config'
import { post as postTable } from '@/server/infra/db/schema/post'
import { session as sessionTable } from '@/server/infra/db/schema/session'
import { user as userTable } from '@/server/infra/db/schema/user'
import { webmention as webmentionTable } from '@/server/infra/db/schema/webmention'

// The admin/me oRPC procedures over the real RPCHandler wire: real SQLite rows,
// adopted DuckDB sidecar, role gating pinned by real 401/403/404/503s.
// Wire paths follow the router OBJECT TREE (api-router.ts), not each procedure's `.route()` path.

const db = getTestDb()

const analyticsHandle: AnalyticsHandle = await createTestAnalyticsDb()
__adoptAnalyticsHandleForTests(analyticsHandle)

beforeEach(async () => {
  await clearAllTables(db)
  await clearAccessLog(analyticsHandle)
})

afterAll(async () => {
  __resetAnalyticsEngineForTests()
  await closeTestAnalyticsDb(analyticsHandle)
})

type RpcError = { code: string; status: number; message: string }

async function seedUser(opts: Partial<typeof userTable.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(userTable)
    .values({
      name: opts.name ?? 'User',
      email: opts.email ?? `user-${Math.random().toString(36).slice(2)}@example.com`,
      password: opts.password ?? 'hashed',
      role: opts.role ?? 'admin',
      ...opts,
    })
    .returning({ id: userTable.id })
  return rows[0]!.id
}

async function seedSession(sid: string, userId: number): Promise<void> {
  await db.insert(sessionTable).values({
    id: sid,
    userId,
    data: {},
    userAgent: 'vitest',
    ip: '127.0.0.1',
    loginAt: new Date('2024-01-01T00:00:00.000Z'),
    lastActiveAt: new Date('2024-01-02T00:00:00.000Z'),
    expiresAt: new Date(Date.now() + 3_600_000),
  })
}

async function seedPost(opts: Partial<typeof postTable.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(postTable)
    .values({
      slug: opts.slug ?? `post-${Math.random().toString(36).slice(2)}`,
      title: opts.title ?? 'Untitled',
      authorId: opts.authorId ?? 1,
      published: opts.published ?? true,
      publishedRevisionId: opts.publishedRevisionId ?? 1,
      updatedAt: opts.updatedAt ?? new Date('2024-01-01'),
      publishedAt: opts.publishedAt ?? new Date('2024-01-01'),
      visible: opts.visible ?? true,
      ...opts,
    })
    .returning({ id: postTable.id })
  return rows[0]!.id
}

async function seedComment(userId: number, overrides: Partial<typeof commentTable.$inferInsert> = {}): Promise<void> {
  await db.insert(commentTable).values({
    type: 'post',
    ownerId: 1,
    userId,
    content: 'hello',
    ...overrides,
  })
}

describe('account.profile', () => {
  it('returns the profile plus the passkey/mail feature switches for an authed user', async () => {
    const id = await seedUser({ name: 'Admin', email: 'admin@example.com', role: 'admin' })

    const res = await callRpc('/account/profile', undefined, makeAuthedCtx({ db, userId: String(id) }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{
      user: Record<string, unknown>
      passkeyEnabled: boolean
      mailReady: boolean
    }>(res)

    expect(json.user).toMatchObject({
      id: String(id),
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      loginMethod: 'password',
    })
    // The test settings fixture disables both switches.
    expect(json.passkeyEnabled).toBe(false)
    expect(json.mailReady).toBe(false)
  })

  it('answers UNAUTHORIZED for anonymous callers', async () => {
    const res = await callRpc('/account/profile', undefined, makePublicCtx({ db }))
    expect(res.status).toBe(401)
    expect((await parseRpcJson<RpcError>(res)).code).toBe('UNAUTHORIZED')
  })
})

describe('account.sessions', () => {
  it('returns the raw session rows of the caller, other users excluded', async () => {
    const me = await seedUser({ name: 'Me' })
    const other = await seedUser({ name: 'Other' })
    await seedSession('sess-mine', me)
    await seedSession('sess-mine-2', me)
    await seedSession('sess-other', other)

    const res = await callRpc('/account/sessions', undefined, makeAuthedCtx({ db, userId: String(me) }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<Array<{ sid: string; userId: number; userAgent: string; loginAt: string }>>(res)

    expect(json.map((s) => s.sid).sort()).toEqual(['sess-mine', 'sess-mine-2'])
    expect(json[0]!.userId).toBe(me)
    expect(json[0]!.userAgent).toBe('vitest')
    expect(json[0]!.loginAt).toBe('2024-01-01T00:00:00.000Z')
  })
})

describe('admin badge endpoints (count / passkeyFlag / pendingCounts)', () => {
  it('admin.users.count returns every user row', async () => {
    await seedUser({ role: 'admin' })
    await seedUser({ role: 'author' })

    const res = await callRpc('/admin/users/count', undefined, makeAuthedCtx({ db }))
    expect(res.status).toBe(200)
    expect(await parseRpcJson<number>(res)).toBe(2)
  })

  it('admin.users.passkeyFlag mirrors the in-process passkey switch', async () => {
    // The test fixture ships `security.passkey.enabled: false`.
    const off = await callRpc('/admin/users/passkeyFlag', undefined, makeAuthedCtx({ db }))
    expect(await parseRpcJson<boolean>(off)).toBe(false)

    // The fixture ships `security` as a literal (never null).
    const security = TEST_BLOG_SETTINGS_BUNDLE.security!
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      security: {
        ...security,
        // Fresh mutable copies — spreading the shared fixture widens `csrf`/`cors` to `| undefined`.
        csrf: { ...security.csrf },
        cors: { ...security.cors },
        passkey: { enabled: true },
      },
    })
    const on = await callRpc('/admin/users/passkeyFlag', undefined, makeAuthedCtx({ db }))
    expect(await parseRpcJson<boolean>(on)).toBe(true)
  })

  it('admin.comments.pendingCount counts approval + deletion pending rows', async () => {
    await seedComment(1, { isPending: true })
    await seedComment(1, { deleteRequestedAt: new Date('2024-01-05') })
    // Settled rows stay out of the badge.
    await seedComment(1, {})
    await seedComment(1, { isPending: true, deletedAt: new Date(Date.now() - 60_000) })

    const res = await callRpc('/admin/comments/pendingCount', undefined, makeAuthedCtx({ db }))
    expect(res.status).toBe(200)
    expect(await parseRpcJson<{ all: number }>(res)).toEqual({ all: 2 })
  })

  it('admin.webmentions.pendingCount counts pending mention rows', async () => {
    await db.insert(webmentionTable).values([
      {
        sourceUrl: 'https://a.example/1',
        targetUrl: 'https://blog.example/posts/1',
        targetType: 'post',
        targetOwnerId: 1,
        status: 'pending',
      },
      {
        sourceUrl: 'https://b.example/2',
        targetUrl: 'https://blog.example/posts/1',
        targetType: 'post',
        targetOwnerId: 1,
        status: 'pending',
      },
      {
        sourceUrl: 'https://c.example/3',
        targetUrl: 'https://blog.example/posts/1',
        targetType: 'post',
        targetOwnerId: 1,
        status: 'approved',
      },
    ])

    const res = await callRpc('/admin/webmentions/pendingCount', undefined, makeAuthedCtx({ db }))
    expect(res.status).toBe(200)
    expect(await parseRpcJson<number>(res)).toBe(2)
  })

  it('rejects authors with FORBIDDEN on every admin-only badge endpoint', async () => {
    const paths = [
      '/admin/users/count',
      '/admin/users/passkeyFlag',
      '/admin/users/listSessions',
      '/admin/comments/pendingCount',
      '/admin/webmentions/pendingCount',
    ]
    for (const path of paths) {
      const res = await callRpc(path, undefined, makeAuthedCtx({ db, role: 'author' }))
      expect(res.status).toBe(403)
      const json = await parseRpcJson<RpcError>(res)
      expect(json.code).toBe('FORBIDDEN')
    }
  })
})

describe('admin.users.listSessions', () => {
  it('returns every live session joined to its user', async () => {
    const admin = await seedUser({ name: 'Admin', email: 'admin@example.com', role: 'admin' })
    const author = await seedUser({ name: 'Author', email: 'author@example.com', role: 'author' })
    await seedSession('sess-admin', admin)
    await seedSession('sess-author', author)

    const res = await callRpc('/admin/users/listSessions', undefined, makeAuthedCtx({ db, userId: String(admin) }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<Array<{ sid: string; userName: string; userEmail: string; userRole: string }>>(res)

    expect(json.map((s) => s.sid).sort()).toEqual(['sess-admin', 'sess-author'])
    expect(json.find((s) => s.sid === 'sess-admin')).toMatchObject({
      userName: 'Admin',
      userEmail: 'admin@example.com',
      userRole: 'admin',
    })
  })
})

describe('comments.myCounts', () => {
  it('returns the full { total, pending, deleteRequested, deleted } tuple', async () => {
    const me = await seedUser({ name: 'Me' })
    await seedComment(me, { isPending: true })
    await seedComment(me, { deleteRequestedAt: new Date('2024-01-05') })
    await seedComment(me, { deletedAt: new Date(Date.now() - 60_000) })
    await seedComment(me, {})
    // Another user's comments never leak into the caller's counters.
    await seedComment(999, { isPending: true })

    const res = await callRpc('/comments/myCounts', undefined, makeAuthedCtx({ db, userId: String(me) }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ total: number; pending: number; deleteRequested: number; deleted: number }>(res)
    expect(json).toEqual({ total: 4, pending: 1, deleteRequested: 1, deleted: 1 })
  })
})

describe('comments.resolveEntity', () => {
  it('resolves an existing entity key to its value/label pair', async () => {
    await seedPost({ slug: 'hello', title: 'Hello' })

    const res = await callRpc('/comments/resolveEntity', { entity: 'post:1' }, makeAuthedCtx({ db }))
    expect(res.status).toBe(200)
    expect(await parseRpcJson<{ value: string; label: string }>(res)).toEqual({ value: 'post:1', label: 'Hello' })
  })

  it('answers null for unknown or malformed keys', async () => {
    await seedPost({ slug: 'hello', title: 'Hello' })

    const missing = await callRpc('/comments/resolveEntity', { entity: 'post:999' }, makeAuthedCtx({ db }))
    expect(await parseRpcJson<null>(missing)).toBeNull()

    const malformed = await callRpc('/comments/resolveEntity', { entity: 'not-a-key' }, makeAuthedCtx({ db }))
    expect(await parseRpcJson<null>(malformed)).toBeNull()
  })

  it('answers UNAUTHORIZED for anonymous callers', async () => {
    const res = await callRpc('/comments/resolveEntity', { entity: 'post:1' }, makePublicCtx({ db }))
    expect(res.status).toBe(401)
    expect((await parseRpcJson<RpcError>(res)).code).toBe('UNAUTHORIZED')
  })
})

describe('admin.posts.mySummary', () => {
  it('scopes counts and recent lists to the calling author', async () => {
    await seedPost({
      title: 'Mine Draft A',
      authorId: 3,
      published: false,
      publishedRevisionId: null,
      updatedAt: new Date('2024-02-01T00:00:00.000Z'),
    })
    await seedPost({
      title: 'Mine Draft B',
      authorId: 3,
      published: false,
      publishedRevisionId: null,
      updatedAt: new Date('2024-01-15T00:00:00.000Z'),
    })
    await seedPost({
      title: 'Mine Published',
      authorId: 3,
      publishedAt: new Date('2024-02-03T00:00:00.000Z'),
    })
    await seedPost({
      title: 'Their Draft',
      authorId: 1,
      published: false,
      publishedRevisionId: null,
      updatedAt: new Date('2024-02-04T00:00:00.000Z'),
    })
    await seedPost({
      title: 'Their Published',
      authorId: 1,
      publishedAt: new Date('2024-02-05T00:00:00.000Z'),
    })

    const res = await callRpc('/admin/posts/mySummary', undefined, makeAuthedCtx({ db, userId: '3', role: 'author' }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{
      draftCount: number
      publishedCount: number
      recentDrafts: Array<{ id: string; title: string; updatedAtIso: string }>
      recentPublished: Array<{ id: string; title: string; updatedAtIso: string }>
    }>(res)

    expect(json.draftCount).toBe(2)
    expect(json.publishedCount).toBe(1)
    // Recent lists sort draft by updatedAt desc and only show own rows.
    expect(json.recentDrafts.map((p) => p.title)).toEqual(['Mine Draft A', 'Mine Draft B'])
    expect(json.recentPublished.map((p) => p.title)).toEqual(['Mine Published'])
  })

  it('answers UNAUTHORIZED for anonymous callers', async () => {
    const res = await callRpc('/admin/posts/mySummary', undefined, makePublicCtx({ db }))
    expect(res.status).toBe(401)
    expect((await parseRpcJson<RpcError>(res)).code).toBe('UNAUTHORIZED')
  })
})

describe('admin.posts.analytics', () => {
  it('returns the post DTO plus the entity-scoped overview', async () => {
    const postId = await seedPost({ slug: 'analytics-post', title: 'Analytics Post' })
    const ts = new Date(Date.now() - 10_000)
    await seedAccessEvents(analyticsHandle, [
      {
        ts,
        visitorHash: 'a',
        path: '/posts/analytics-post',
        entityType: 'post',
        entityId: postId,
        refererHost: 'google.com',
      },
      { ts, visitorHash: 'b', path: '/posts/analytics-post', entityType: 'post', entityId: postId },
      // Another entity's view must stay out of the per-post counters.
      { ts, visitorHash: 'c', path: '/other', entityType: 'post', entityId: postId + 100 },
    ])

    const res = await callRpc('/admin/posts/analytics', { postId, search: '' }, makeAuthedCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{
      post: { id: string; title: string }
      counters: { visits: number; visitors: number; referers: number }
    }>(res)

    expect(json.post.id).toBe(String(postId))
    expect(json.post.title).toBe('Analytics Post')
    expect(json.counters).toEqual({ visits: 2, visitors: 2, referers: 1 })
  })

  it('answers NOT_FOUND for a missing post', async () => {
    const res = await callRpc('/admin/posts/analytics', { postId: 999, search: '' }, makeAuthedCtx({ db }))
    expect(res.status).toBe(404)
    expect((await parseRpcJson<RpcError>(res)).code).toBe('NOT_FOUND')
  })

  it('answers UNAUTHORIZED for anonymous callers', async () => {
    const res = await callRpc('/admin/posts/analytics', { postId: 1, search: '' }, makePublicCtx({ db }))
    expect(res.status).toBe(401)
    expect((await parseRpcJson<RpcError>(res)).code).toBe('UNAUTHORIZED')
  })
})

describe('admin.analytics.overview', () => {
  it('returns the counters/views/heatmap/initialMetrics fan-out for the default range', async () => {
    const ts = new Date(Date.now() - 10_000)
    await seedAccessEvents(analyticsHandle, [
      { ts, visitorHash: 'a', path: '/', refererHost: 'google.com' },
      { ts, visitorHash: 'a', path: '/post/hello' },
      { ts, visitorHash: 'b', path: '/post/world' },
    ])

    const res = await callRpc('/analytics/overview', { search: '' }, makeAuthedCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{
      counters: { visits: number; visitors: number; referers: number }
      views: Array<{ time: string; visits: number; visitors: number }>
      heatmap: Array<{ weekday: number; hour: number; visits: number; visitors: number }>
      initialMetrics: Record<string, Array<{ name: string; visits: number; visitors: number }>>
    }>(res)

    expect(json.counters).toEqual({ visits: 3, visitors: 2, referers: 1 })
    expect(json.views.length).toBeGreaterThan(0)
    expect(json.views.reduce((sum, point) => sum + point.visits, 0)).toBe(3)
    expect(json.heatmap.length).toBeGreaterThan(0)
    // First tab of every metric group ships in the initial fan-out.
    expect(Object.keys(json.initialMetrics).sort()).toEqual(['browser', 'country', 'device', 'language', 'referer'])
  })

  it('rejects authors with FORBIDDEN', async () => {
    const res = await callRpc('/analytics/overview', { search: '' }, makeAuthedCtx({ db, role: 'author' }))
    expect(res.status).toBe(403)
    expect((await parseRpcJson<RpcError>(res)).code).toBe('FORBIDDEN')
  })
})

describe('admin.analytics.mentions', () => {
  it('returns the top referer hosts for the parsed range, unlabeled rows bucketed as (unknown)', async () => {
    const ts = new Date(Date.now() - 10_000)
    await seedAccessEvents(analyticsHandle, [
      { ts, visitorHash: 'a', path: '/', refererHost: 'google.com' },
      { ts, visitorHash: 'b', path: '/', refererHost: 'google.com' },
      { ts, visitorHash: 'c', path: '/', refererHost: 'twitter.com' },
      { ts, visitorHash: 'd', path: '/' },
    ])

    const res = await callRpc('/analytics/mentions', { search: '' }, makeAuthedCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{ referers: Array<{ name: string; visits: number; visitors: number }> }>(res)

    // Referers group by `referer_host` (the appender stores the host) — see `METRIC_COLUMN` in duckdb-sql.ts.
    expect(json.referers.map((r) => r.name).sort()).toEqual(['(unknown)', 'google.com', 'twitter.com'])
    expect(json.referers.find((r) => r.name === 'google.com')).toMatchObject({ visits: 2, visitors: 2 })
  })

  it('rejects authors with FORBIDDEN', async () => {
    const res = await callRpc('/analytics/mentions', { search: '' }, makeAuthedCtx({ db, role: 'author' }))
    expect(res.status).toBe(403)
    expect((await parseRpcJson<RpcError>(res)).code).toBe('FORBIDDEN')
  })
})

describe('admin.settings.bootstrap', () => {
  it('hydrates + backfills the bundle, redacts secrets, and lists timezones', async () => {
    resetBlogSettingsForTests()
    await db.insert(setting).values([
      { scope: 'blog.general', data: TEST_BLOG_SETTINGS_BUNDLE.siteIdentity },
      { scope: 'blog.assets', data: TEST_BLOG_SETTINGS_BUNDLE.assets },
    ])

    const res = await callRpc('/admin/settings/bootstrap', undefined, makeAuthedCtx({ db }))
    expect(res.status).toBe(200)
    const json = await parseRpcJson<{
      bundle: {
        siteIdentity: { title: string }
        assets: { storage: { secretAccessKey: string } }
      }
      timeZones: string[]
      masks: { assetsSecretAccessKeyMask: string | null }
    }>(res)

    expect(json.bundle.siteIdentity.title).toBe('且听书吟')
    // The admin bundle blanks the secret; the mask exposes only the last 4 characters.
    expect(json.bundle.assets.storage.secretAccessKey).toBe('')
    expect(json.masks.assetsSecretAccessKeyMask).toBe('test')
    expect(json.timeZones.length).toBeGreaterThan(0)
    expect(json.timeZones).toContain('Asia/Shanghai')
  })

  it('answers SERVICE_UNAVAILABLE before installation', async () => {
    resetBlogSettingsForTests()

    const res = await callRpc('/admin/settings/bootstrap', undefined, makeAuthedCtx({ db }))
    expect(res.status).toBe(503)
    const json = await parseRpcJson<RpcError>(res)
    expect(json.code).toBe('SERVICE_UNAVAILABLE')
  })
})
