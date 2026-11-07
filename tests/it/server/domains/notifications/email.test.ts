import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import type { SessionUser } from '@/server/domains/auth/session-storage'
import type { Role } from '@/shared/utils/roles'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { NOTIFICATION_EMAIL_FOOTER } from '@/server/domains/notifications/email'
import {
  notifyAdmins,
  replyToThread,
  sendBroadcast,
  sendDirectMessage,
  unreadCount,
} from '@/server/domains/notifications/service'
import { user } from '@/server/infra/db/schema/user'

// ADR-0008 delivery: real in-app fan-out + real notification rows; only the
// Mailgun `fetch` edge is stubbed (same seam as comments/services/email.test.ts).

const logWarn = vi.hoisted(() => vi.fn())
const logError = vi.hoisted(() => vi.fn())

vi.mock('@/server/infra/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/logger')>()
  return {
    ...actual,
    getLogger: (scope: string) => {
      const real = actual.getLogger(scope)
      return scope === 'notifications.email' ? { ...real, warn: logWarn, error: logError } : real
    },
  }
})

const db = getTestDb()

const mailgunConfigured = {
  enabled: true,
  notificationEmails: true,
  transport: 'mailgun' as const,
  mailgunDomain: 'mg.example.com',
  mailgunApiKey: 'SECRET',
  sender: 'noreply@example.com',
}

function setMail(overrides: Partial<typeof mailgunConfigured> = {}): void {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    mail: { mail: { ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail, ...mailgunConfigured, ...overrides } },
  })
}

const fetchMock = vi.fn<typeof fetch>()

let seq = 0
async function seedUser(role: Role, name: string): Promise<number> {
  seq += 1
  const rows = await db
    .insert(user)
    .values({ name, email: `${name}-${seq}@example.com`, password: 'hashed', role })
    .returning({ id: user.id })
  return rows[0]!.id
}

function viewer(id: number, role: Role, name = 'viewer'): SessionUser {
  return { id: String(id), name, email: `${name}@example.com`, website: null, role }
}

/** Drain the fire-and-forget microtask/macrotask chain when no send is expected. */
async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function sentMessage(index: number): FormData {
  const [, init] = fetchMock.mock.calls[index]!
  return init?.body as FormData
}

beforeEach(async () => {
  await clearAllTables(db)
  seq = 0
  logWarn.mockReset()
  logError.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  setMail()
})

afterEach(() => {
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  vi.unstubAllGlobals()
})

describe('notifications email — gating', () => {
  it('mail disabled: the producer writes the in-app row and attempts no send', async () => {
    setMail({ enabled: false })
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')

    sendDirectMessage(db, adminId, visitorId, { title: '私信', body: '正文' })
    await settle()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(unreadCount(db, visitorId)).toBe(1)
  })

  it('toggle off: in-app delivery only', async () => {
    setMail({ notificationEmails: false })
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')

    sendDirectMessage(db, adminId, visitorId, { title: '私信', body: '正文' })
    await settle()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(unreadCount(db, visitorId)).toBe(1)
  })
})

describe('notifications email — direct and admin kinds', () => {
  it('sends one direct email with the DM subject, escaped body, site CTA and opt-out footer', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')

    sendDirectMessage(db, adminId, visitorId, { title: '私信标题', body: '你好 <script>alert(1)</script>' })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const body = sentMessage(0)
    expect(body.get('to')).toBe('visitor-2@example.com')
    expect(body.get('subject')).toBe(`您在【${TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title}】收到一条新私信`)
    const html = body.get('html') as string
    expect(html).toContain('私信标题')
    // Plain text rows are escaped by React — never injected as HTML.
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('你好，visitor')
    expect(html).toContain(`href="${TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.website}"`)
    expect(html).toContain(NOTIFICATION_EMAIL_FOOTER)
    // The DM CTA is the site root, never the admin shell.
    expect(html).not.toContain('href="https://example.com/admin"')
  })

  it('sends one admin alert per admin with the system-alert subject and /admin CTA', async () => {
    await seedUser('admin', 'admin')
    const secondAdminId = await seedUser('admin', 'admin2')
    const authorId = await seedUser('author', 'author')

    const row = notifyAdmins(db, { title: 'Zeabur 下线', body: '请重新配置邮件', source: 'zeabur-mail-cleanup' })
    expect(row).not.toBeNull()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const recipients = [sentMessage(0).get('to'), sentMessage(1).get('to')].sort((a, b) =>
      String(a).localeCompare(String(b)),
    )
    expect(recipients).toEqual(['admin-1@example.com', 'admin2-2@example.com'])
    expect(recipients).not.toContain('author-3@example.com')

    const html = sentMessage(0).get('html') as string
    expect(sentMessage(0).get('subject')).toBe(
      `【${TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title}】系统提醒：Zeabur 下线`,
    )
    expect(html).toContain('Zeabur 下线')
    expect(html).toContain('请重新配置邮件')
    expect(html).toContain('href="https://example.com/admin"')
    expect(html).toContain(NOTIFICATION_EMAIL_FOOTER)
    // Both admins were resolved as recipients; the author was not.
    expect(secondAdminId).toBeGreaterThan(0)
    expect(authorId).toBeGreaterThan(0)
  })

  it('never emails a broadcast', async () => {
    const adminId = await seedUser('admin', 'admin')
    await seedUser('visitor', 'visitor')

    sendBroadcast(db, adminId, { title: '公告', body: '正文', replyable: true })
    await settle()

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('notifications email — replies', () => {
  it('direct reply: exactly one email per other participant', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const root = sendDirectMessage(db, adminId, visitorId, { title: '私信', body: '第一条' })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    fetchMock.mockClear()

    replyToThread(db, viewer(visitorId, 'visitor', 'visitor'), { threadId: root.threadId, body: '回复' })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    // The replier does not email themselves; the admin receives the reply.
    expect(sentMessage(0).get('to')).toBe('admin-1@example.com')
    expect(sentMessage(0).get('subject')).toBe(`您在【${TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title}】收到一条新私信`)
    expect(sentMessage(0).get('html')).toContain('回复')
  })

  it('broadcast reply fork: mails the admins, never the replier or the audience', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const otherVisitorId = await seedUser('visitor', 'visitor2')
    const root = sendBroadcast(db, adminId, { title: '公告', body: '正文', replyable: true })
    await settle()
    expect(fetchMock).not.toHaveBeenCalled()

    replyToThread(db, viewer(visitorId, 'visitor', 'visitor'), { threadId: root.threadId, body: '想问问' })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    expect(sentMessage(0).get('to')).toBe('admin-1@example.com')
    // The other audience member never sees the fork, and the replier's own
    // pre-read copy gets no mail.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(otherVisitorId).toBeGreaterThan(0)
  })
})

describe('notifications email — failure isolation', () => {
  it('a transport failure leaves the producer result intact and only logs', async () => {
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

    const row = sendDirectMessage(db, adminId, visitorId, { title: '私信', body: '正文' })

    // Synchronous producer contract: the row exists before any mail work settles.
    expect(row.threadId).toBe(row.id)
    expect(unreadCount(db, visitorId)).toBe(1)

    await vi.waitFor(() => expect(logWarn).toHaveBeenCalled())
    const [, context] = logWarn.mock.calls[0]!
    expect(context).toMatchObject({ reason: 'network', userId: visitorId })
    // Recipient PII stays out of the log: the user id carries the same debug value.
    expect(context).not.toMatchObject({ to: expect.anything() })
    expect(JSON.stringify(context)).not.toContain('visitor-2@example.com')
    expect(unreadCount(db, visitorId)).toBe(1)
  })
})
