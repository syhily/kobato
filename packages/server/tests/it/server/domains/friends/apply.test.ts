import { friend } from '@kobato/db/schema/friend.ts'
import { user } from '@kobato/db/schema/user.ts'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle.ts'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher.ts'
import { listPublicFriends } from '@kobato/server/domains/friends/service.ts'
import { adminFriendsRouter } from '@kobato/server/http/controllers/admin/friends.controller.ts'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry.ts'
import { invalidateMailTransportCache } from '@kobato/server/infra/email/sender.ts'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit.ts'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/test/blog-settings.ts'
import { installFetch } from '@kobato/test/fetch.ts'
import { clearAllTables, getTestDb } from '@kobato/test/integration-db.ts'
import { makeAuthedCtx, makePublicCtx } from '@kobato/test/mock-ctx.ts'
import { callRpc } from '@kobato/test/rpc-call.ts'
import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = getTestDb()

const mockFetch = installFetch()

const ADMIN_EMAIL = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.author.email

function enableMail() {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    mail: {
      mail: {
        ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail,
        enabled: true,
        transport: 'mailgun',
        mailgunDomain: 'mail.test',
        mailgunApiKey: 'TEST-KEY',
        sender: 'noreply@example.com',
      },
    },
  })
  invalidateMailTransportCache()
  mockFetch.enqueue('https://api.mailgun.net/v3/mail.test/messages', new Response(null, { status: 200 }))
}

beforeEach(async () => {
  await clearAllTables(db)
  __resetRateLimitsForTests()
  mockFetch.reset()
  globalThis.fetch = mockFetch.fetch as unknown as typeof globalThis.fetch
  enableMail()
})

async function apply(input: Record<string, unknown>): Promise<Response> {
  return callRpc('/friends/apply', input, makePublicCtx({ db }))
}

async function friendRows(): Promise<(typeof friend.$inferSelect)[]> {
  return db.select().from(friend)
}

function lastMailBody(): { to: string; subject: string; html: string } {
  const mailCall = mockFetch.calls.at(-1)
  expect(mailCall).toBeDefined()
  const body = mailCall!.init?.body as FormData
  return { to: body.get('to') as string, subject: body.get('subject') as string, html: body.get('html') as string }
}

async function seedAdmin(): Promise<number> {
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

function adminCtx(adminId: number) {
  return makeAuthedCtx({ userId: adminId.toString(), role: 'admin', db })
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

    expect(await listPublicFriends(db)).toEqual([])

    await vi.waitFor(() => {
      expect(mockFetch.calls).toHaveLength(1)
    })
    const mail = lastMailBody()
    expect(mail.to).toBe(ADMIN_EMAIL)
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
    expect(mockFetch.calls).toHaveLength(1)
  })

  it('throttles applications once the per-IP rate limit trips', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      mail: {
        mail: {
          ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail,
          enabled: true,
          transport: 'mailgun',
          mailgunDomain: 'mail.test',
          mailgunApiKey: 'TEST-KEY',
          sender: 'noreply@example.com',
        },
      },
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        resource: { windowSeconds: 60, maxAttempts: 1 },
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
    initAllBatchers(getDatabaseHandle())
  })

  afterEach(async () => {
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
