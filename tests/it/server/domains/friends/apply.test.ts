import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { installFetch } from '#/_helpers/fetch'
import { clearAllTables } from '#/_helpers/integration-db'
import { makeAuthedCtx, makePublicCtx } from '#/_helpers/mock-ctx'
import { callRpc } from '#/_helpers/rpc-call'
import { flushAuditLog } from '@/server/domains/audit/repos/batcher'
import { listPublicFriends } from '@/server/domains/friends/service'
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/services/test-utils'
import { adminFriendsRouter } from '@/server/http/controllers/admin/friends.controller'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { friend } from '@/server/infra/db/schema/friend'
import { user } from '@/server/infra/db/schema/user'
import { invalidateMailTransportCache } from '@/server/infra/email/sender'
import { __resetRateLimitsForTests } from '@/server/infra/rate-limit'

vi.mock('@/server/domains/images/services/enhance', () => ({
  hydrateImageRefs: vi.fn(async () => undefined),
}))

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

const mockFetch = installFetch()

const ADMIN_EMAIL = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.author.email

afterAll(async () => {
  await closePool(pool)
})

// Zeabur transport against the mocked fetch — one enqueued response
// covers one notification email. Tests that expect a send additionally
// `vi.waitFor` the call so the fire-and-forget promise settles inside
// the test that triggered it (no cross-test bleed).
function enableMail() {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    mail: {
      mail: {
        ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail,
        enabled: true,
        host: 'mail.test',
        apiKey: 'TEST-KEY',
        sender: 'noreply@example.com',
      },
    },
  })
  invalidateMailTransportCache()
  mockFetch.enqueue('https://mail.test/api/v1/zsend/emails', new Response(null, { status: 200 }))
}

beforeEach(async () => {
  await clearAllTables(db)
  // The rate limiter is a process-level Map — reset it or earlier tests
  // (same client IP) exhaust the window for later ones.
  __resetRateLimitsForTests()
  mockFetch.reset()
  globalThis.fetch = mockFetch.fetch as unknown as typeof globalThis.fetch
  enableMail()
})

async function apply(input: Record<string, unknown>): Promise<Response> {
  return callRpc('/friends/apply', input, makePublicCtx({ db, pool }))
}

async function friendRows(): Promise<(typeof friend.$inferSelect)[]> {
  return db.select().from(friend)
}

function lastMailBody(): { to: string[]; subject: string; html: string } {
  const mailCall = mockFetch.calls.at(-1)
  expect(mailCall).toBeDefined()
  return JSON.parse(mailCall!.init?.body as string)
}

// audit_log.actor_id references user.id — the admin actor must be a
// real row or the audit insert dead-letters on the FK.
async function seedAdmin(): Promise<bigint> {
  const rows = await db
    .insert(user)
    .values({
      name: 'Admin',
      email: `admin-${Date.now()}-${Math.random()}@example.com`,
      password: 'hashed',
      role: 'admin',
    })
    .returning({ id: user.id })
  return rows[0]!.id
}

function adminCtx(adminId: bigint) {
  return makeAuthedCtx({ userId: adminId.toString(), role: 'admin', db, pool })
}

describe('integration / friends apply', () => {
  it('stores the application as a pending row and emails the admin', async () => {
    const res = await apply({
      website: '小鱼的博客',
      homepage: 'https://blog.example.com',
      description: '记录前端与生活',
      poster: 'https://blog.example.com/cover.jpg',
      rssUrl: 'https://blog.example.com/feed.xml',
    })
    expect(res.status).toBe(200)

    const rows = await friendRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      website: '小鱼的博客',
      homepage: 'https://blog.example.com',
      description: '记录前端与生活',
      poster: 'https://blog.example.com/cover.jpg',
      rssUrl: 'https://blog.example.com/feed.xml',
      visible: false,
    })

    // The pending row never leaks into the public projection.
    expect(await listPublicFriends(db)).toEqual([])

    await vi.waitFor(() => {
      expect(mockFetch.calls).toHaveLength(1)
    })
    const mail = lastMailBody()
    expect(mail.to).toEqual([ADMIN_EMAIL])
    expect(mail.subject).toContain('友链申请')
    expect(mail.html).toContain('小鱼的博客')
    expect(mail.html).toContain('https://blog.example.com')
  })

  it('stores an empty poster when the applicant has no cover URL', async () => {
    const res = await apply({ website: '无封面', homepage: 'https://nocover.example.com' })
    expect(res.status).toBe(200)
    const rows = await friendRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.poster).toBe('')
    expect(rows[0]!.visible).toBe(false)
    await vi.waitFor(() => {
      expect(mockFetch.calls).toHaveLength(1)
    })
  })

  it('rejects bot submissions via the honeypot field', async () => {
    const res = await apply({
      website: '机器人',
      homepage: 'https://bot.example.com',
      contact: 'spammy',
    })
    expect(res.status).toBe(400)
    expect(await friendRows()).toHaveLength(0)
    expect(mockFetch.calls).toHaveLength(0)
  })

  it('rejects non-http(s) homepage URLs', async () => {
    const res = await apply({ website: 'XSS', homepage: 'javascript:alert(1)' })
    expect(res.status).toBe(400)
    expect(await friendRows()).toHaveLength(0)
  })

  it('rejects a repeat application for the same homepage', async () => {
    const first = await apply({ website: '首次', homepage: 'https://dup.example.com' })
    expect(first.status).toBe(200)
    await vi.waitFor(() => {
      expect(mockFetch.calls).toHaveLength(1)
    })

    const dup = await apply({ website: '重复', homepage: 'https://dup.example.com' })
    expect(dup.status).toBe(409)

    const rows = await friendRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.website).toBe('首次')
    // The duplicate was rejected before the notification leg.
    expect(mockFetch.calls).toHaveLength(1)
  })

  it('throttles applications once the per-IP rate limit trips', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      mail: {
        mail: {
          ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail,
          enabled: true,
          host: 'mail.test',
          apiKey: 'TEST-KEY',
          sender: 'noreply@example.com',
        },
      },
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        resourceIp: { windowSeconds: 60, maxAttempts: 1 },
      },
    })

    const first = await apply({ website: '第一', homepage: 'https://one.example.com' })
    expect(first.status).toBe(200)
    await vi.waitFor(() => {
      expect(mockFetch.calls).toHaveLength(1)
    })

    const second = await apply({ website: '第二', homepage: 'https://two.example.com' })
    expect(second.status).toBe(429)

    const rows = await friendRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.website).toBe('第一')
  })
})

describe('integration / friends apply → admin approve', () => {
  beforeEach(() => {
    initAllBatchers(pool, db)
  })

  afterEach(async () => {
    // Flush BEFORE reset (and before the next clearAllTables wipes the
    // seeded admin) — otherwise the batcher's 500ms timer can fire into
    // the next test and dead-letter the buffered events on the
    // audit_log.actor_id FK.
    await flushAuditLog()
    resetAllBatchers()
  })

  it('flips visible on approve and the friend appears in listPublicFriends', async () => {
    const res = await apply({
      website: '准友链',
      homepage: 'https://approve.example.com',
      poster: 'https://approve.example.com/cover.jpg',
    })
    expect(res.status).toBe(200)
    await vi.waitFor(() => {
      expect(mockFetch.calls).toHaveLength(1)
    })

    const before = await db.select().from(friend).where(eq(friend.homepage, 'https://approve.example.com'))
    expect(before).toHaveLength(1)
    expect(before[0]!.visible).toBe(false)
    expect(await listPublicFriends(db)).toEqual([])

    // The approve action reuses the existing admin upsert path.
    const adminId = await seedAdmin()
    const approveRes = await call(
      adminFriendsRouter.upsert,
      {
        id: String(before[0]!.id),
        website: before[0]!.website,
        homepage: before[0]!.homepage,
        poster: before[0]!.poster,
        visible: true,
      },
      { context: adminCtx(adminId) },
    )
    expect(approveRes.friend.visible).toBe(true)

    const after = await db.select().from(friend).where(eq(friend.id, before[0]!.id))
    expect(after[0]!.visible).toBe(true)

    const publicFriends = await listPublicFriends(db)
    expect(publicFriends).toHaveLength(1)
    expect(publicFriends[0]).toMatchObject({
      website: '准友链',
      homepage: 'https://approve.example.com',
      poster: 'https://approve.example.com/cover.jpg',
    })
  })
})
