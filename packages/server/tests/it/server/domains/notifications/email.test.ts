import type { Role } from '@kobato/auth/roles'
import type { SessionUser } from '@kobato/server/domains/auth/session-storage'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { user } from '@kobato/db/sqlite/schema/user'
import { SUPPORTED_LOCALES } from '@kobato/i18n/locales'
import {
  notifyAdmins,
  replyToThread,
  sendBroadcast,
  sendDirectMessage,
  unreadCount,
} from '@kobato/server/domains/notifications/service'
import { createServerTranslator } from '@kobato/server/infra/i18n'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@kobato/server/infra/logger'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

function emailLogs(level: 'warn' | 'error') {
  return __logCaptureForTests().filter((entry) => entry.scope === 'notifications.email' && entry.level === level)
}

const db = getTestDb()

const SYSTEM_NOTICE = {
  titleKey: 'notification.backup.cacheWipeFailed.title',
  bodyKey: 'notification.backup.cacheWipeFailed.body',
} as const
const ZH_NOTICE = createServerTranslator('zh-CN')
const EN_NOTICE = createServerTranslator('en-US')

const NOTIFICATION_EMAIL_FOOTER = createServerTranslator('zh-CN').format('email.notification.footerNote')

const mailgunConfigured = {
  enabled: true,
  notificationEmails: true,
  transport: 'mailgun' as const,
  mailgunDomain: 'mg.example.com',
  mailgunApiKey: 'SECRET',
  sender: 'noreply@example.com',
}

function setSiteLocale(locale: 'en-US' | 'zh-CN' | 'zh-TW' | 'zh-HK'): void {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale },
    mail: { mail: { ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail, ...mailgunConfigured } },
  })
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
  const rows = await sqliteOf(db)
    .insert(user)
    .values({ name, email: `${name}-${seq}@example.com`, password: 'hashed', role })
    .returning({ id: user.id })
  return rows[0]!.id
}

function viewer(id: number, role: Role, name = 'viewer'): SessionUser {
  return { id: String(id), name, email: `${name}@example.com`, website: null, role }
}

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
  __clearLogCaptureForTests()
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
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('你好，visitor')
    expect(html).toContain(`href="${TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.website}"`)
    expect(html).toContain(NOTIFICATION_EMAIL_FOOTER)
    expect(html).not.toContain('href="https://example.com/admin"')
  })

  it('sends one admin alert per admin with the system-alert subject and /admin CTA', async () => {
    await seedUser('admin', 'admin')
    const secondAdminId = await seedUser('admin', 'admin2')
    const authorId = await seedUser('author', 'author')

    const row = notifyAdmins(db, SYSTEM_NOTICE)
    expect(row).not.toBeNull()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const recipients = [sentMessage(0).get('to'), sentMessage(1).get('to')].sort((a, b) =>
      String(a).localeCompare(String(b)),
    )
    expect(recipients).toEqual(['admin-1@example.com', 'admin2-2@example.com'])
    expect(recipients).not.toContain('author-3@example.com')

    const html = sentMessage(0).get('html') as string
    const expectedTitle = ZH_NOTICE.format(SYSTEM_NOTICE.titleKey)
    expect(sentMessage(0).get('subject')).toBe(
      `【${TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title}】系统提醒：${expectedTitle}`,
    )
    expect(html).toContain(expectedTitle)
    expect(html).toContain(ZH_NOTICE.format(SYSTEM_NOTICE.bodyKey))
    expect(html).toContain('href="https://example.com/admin"')
    expect(html).toContain(NOTIFICATION_EMAIL_FOOTER)
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

    expect(row.threadId).toBe(row.id)
    expect(unreadCount(db, visitorId)).toBe(1)

    await vi.waitFor(() => expect(emailLogs('warn').length).toBeGreaterThan(0))
    const context = emailLogs('warn')[0]!.ctx
    expect(context).toMatchObject({ reason: 'network', userId: visitorId })
    expect(context).not.toMatchObject({ to: expect.anything() })
    expect(JSON.stringify(context)).not.toContain('visitor-2@example.com')
    expect(unreadCount(db, visitorId)).toBe(1)
  })

  it('keeps fanning out when one recipient’s transport rejects', async () => {
    const adminId = await seedUser('admin', 'admin')
    const secondAdminId = await seedUser('admin', 'admin2')
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    notifyAdmins(db, SYSTEM_NOTICE)

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const attempted = fetchMock.mock.calls.map((_, index) => String(sentMessage(index).get('to')))
    expect(new Set(attempted)).toEqual(new Set(['admin-1@example.com', 'admin2-2@example.com']))

    const warns = emailLogs('warn')
    expect(warns).toHaveLength(1)
    const warned = warns[0]!.ctx as { reason: string; userId: number }
    expect(warned.reason).toBe('network')
    expect(attempted[0]).toBe(warned.userId === adminId ? 'admin-1@example.com' : 'admin2-2@example.com')
    expect(emailLogs('error')).toHaveLength(0)

    expect(unreadCount(db, adminId)).toBe(1)
    expect(unreadCount(db, secondAdminId)).toBe(1)
  })

  it('a thrown send for one recipient does not starve the rest of the fan-out', async () => {
    const senderModule = await import('@kobato/server/infra/email/sender')
    await seedUser('admin', 'admin')
    await seedUser('admin', 'admin2')
    const rejectOnce = vi.spyOn(senderModule, 'sendEmail').mockRejectedValueOnce(new Error('bad address'))

    try {
      notifyAdmins(db, SYSTEM_NOTICE)

      await vi.waitFor(() => expect(emailLogs('error')).toHaveLength(1))
      expect(emailLogs('error')[0]!.msg).toBe('failed to send notification email')
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
      expect(rejectOnce).toHaveBeenCalledTimes(2)
      expect(emailLogs('warn')).toHaveLength(0)
    } finally {
      rejectOnce.mockRestore()
    }
  })
})

describe('notifications email — site locale at send time', () => {
  function setEnglishSite(): void {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale: 'en-US' },
      mail: { mail: { ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail, ...mailgunConfigured } },
    })
  }

  it('renders the English direct-message subject, labels, CTA and opt-out footer', async () => {
    setEnglishSite()
    const adminId = await seedUser('admin', 'admin')
    const visitorId = await seedUser('visitor', 'visitor')
    const title = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title

    sendDirectMessage(db, adminId, visitorId, { title: 'DM title', body: 'hello there' })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const body = sentMessage(0)
    expect(body.get('subject')).toBe(`You received a new direct message on ${title}`)
    const html = body.get('html') as string
    expect(html).toContain('New direct message')
    expect(html).toContain('Title:')
    expect(html).toContain('Content:')
    expect(html).toContain('Visit the site')
    expect(html).toContain('This email was triggered by a system notification. You can turn notification emails off')
    expect(html).toContain('DM title')
    expect(html).toContain('hello there')
  })

  it('renders the English admin-alert subject and admin CTA', async () => {
    setEnglishSite()
    await seedUser('admin', 'admin')
    const title = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title

    notifyAdmins(db, SYSTEM_NOTICE)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const body = sentMessage(0)
    const expectedTitle = EN_NOTICE.format(SYSTEM_NOTICE.titleKey)
    expect(body.get('subject')).toBe(`${title}: System alert: ${expectedTitle}`)
    const html = body.get('html') as string
    expect(html).toContain('Open the admin panel')
    expect(html).toContain('href="https://example.com/admin"')
    expect(html).toContain(expectedTitle)
    expect(html).toContain(EN_NOTICE.format(SYSTEM_NOTICE.bodyKey))
  })
})

const DESCRIPTOR_EMAIL_BY_LOCALE = {
  'en-US': {
    title: 'Background task failed: backup',
    body: 'Task backup failed on its most recent run: DISK FULL Open the Tasks page for details.',
  },
  'zh-CN': {
    title: '后台任务失败：backup',
    body: '任务「backup」最近一次执行失败：DISK FULL请到「任务」页面查看详情。',
  },
  'zh-TW': {
    title: '後台任務失敗：backup',
    body: '任務「backup」最近一次執行失敗：DISK FULL請到「任務」頁面檢視詳情。',
  },
  'zh-HK': {
    title: '後台任務失敗：backup',
    body: '任務「backup」最近一次執行失敗：DISK FULL請到「任務」頁面檢視詳情。',
  },
} as const

const STORED_FALLBACK_TITLE = 'Background task failed: backup'
const STORED_FALLBACK_BODY = 'Task backup failed on its most recent run: DISK FULL Open the Tasks page for details.'

describe('notifications email — descriptor resolution', () => {
  it.each(SUPPORTED_LOCALES)('renders the descriptor in %s at send time', async (locale) => {
    setSiteLocale(locale)
    await seedUser('admin', 'admin')
    const siteTitle = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title
    const expected = DESCRIPTOR_EMAIL_BY_LOCALE[locale]

    const row = notifyAdmins(db, {
      titleKey: 'notification.job.failed.title',
      titleParams: { taskKey: 'backup' },
      bodyKey: 'notification.job.failed.body',
      bodyParams: { taskKey: 'backup', hasError: 'yes', error: 'DISK FULL' },
    })!
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    expect(row.title).toBe(STORED_FALLBACK_TITLE)
    const body = sentMessage(0)
    expect(body.get('subject')).toBe(
      createServerTranslator(locale).format('email.notification.adminSubject', {
        siteTitle,
        title: expected.title,
      }),
    )
    const html = body.get('html') as string
    expect(html).toContain(expected.title)
    expect(html).toContain(expected.body)

    if (locale !== 'en-US') {
      expect(html).not.toContain(STORED_FALLBACK_TITLE)
      expect(html).not.toContain(STORED_FALLBACK_BODY)
    }
  })

  it('falls back to the stored English message when the descriptor key is gone', async () => {
    setSiteLocale('zh-TW')
    await seedUser('admin', 'admin')
    const title = TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title
    const { createNotificationWithRecipients } = await import('@kobato/db/sqlite/operations/engagement/notification')
    const { sendNotificationEmail } = await import('@kobato/server/domains/notifications/email')
    const adminRows = sqliteOf(db).select().from(user).all()

    const row = createNotificationWithRecipients(
      db,
      {
        kind: 'admin',
        senderId: null,
        title: 'Removed system notice',
        body: 'This row outlived its catalog key.',
        titleKey: 'notification.removed.key',
        bodyKey: 'notification.removed.key',
        replyable: false,
      },
      adminRows.map((entry) => entry.id),
    )
    await sendNotificationEmail(
      db,
      row,
      adminRows.map((entry) => entry.id),
    )

    const body = sentMessage(0)
    expect(body.get('subject')).toBe(`【${title}】系統提醒：Removed system notice`)
    const html = body.get('html') as string
    expect(html).toContain('Removed system notice')
    expect(html).toContain('This row outlived its catalog key.')
  })

  it('encodes HTML-shaped params verbatim and escapes them in the email HTML', async () => {
    setSiteLocale('en-US')
    await seedUser('admin', 'admin')

    const row = notifyAdmins(db, {
      titleKey: 'notification.job.failed.title',
      titleParams: { taskKey: '<script>alert(1)</script>' },
      bodyKey: 'notification.job.failed.body',
      bodyParams: { taskKey: 'backup', hasError: 'yes', error: "Unexpected token '<'" },
    })!
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    expect(row.title).toBe('Background task failed: <script>alert(1)</script>')
    const body = sentMessage(0)
    expect(body.get('subject')).toBe(`${TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title}: System alert: ${row.title}`)

    const html = body.get('html') as string
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('Unexpected token')
    expect(html).toContain('&lt;')
  })
})
