import type { BlogSession } from '@kobato/server/domains/auth/session-storage'
import type { BlogSettingsBundle } from '@kobato/settings/types'
import type { Mock } from 'vitest'

import { sqliteOf } from '@kobato/db/database'
import { auditLog } from '@kobato/db/schema/config'
import { session as sessionTable } from '@kobato/db/schema/session'
import { user, verification } from '@kobato/db/schema/user'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import { createCaptureMailFixture, parseMail } from '@kobato/server/tests/utils/capture-mail'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeSession } from '@kobato/server/tests/utils/session'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { makeRouteContext } from '@tests/utils/context'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = getTestDb()
const mail = await createCaptureMailFixture()

const CSRF_TOKEN = 'signin-magiclink-csrf-token'

const MAGIC_LINK_TEST_BUNDLE = {
  ...TEST_BLOG_SETTINGS_BUNDLE,
  security: {
    ...TEST_BLOG_SETTINGS_BUNDLE.security,
    passkey: { enabled: true },
  },
  mail: {
    mail: {
      ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail,
      enabled: true,
      transport: 'mailgun',
      mailgunDomain: 'mail.test',
      mailgunApiKey: 'test-key',
    },
  },
  rateLimit: {
    ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit,
    signIn: { windowSeconds: 60, maxAttempts: 10 },
    otpSend: { windowSeconds: 60, maxAttempts: 3 },
  },
} as BlogSettingsBundle

const { action, loader } = await import('@/routes/auth/signin')

let testSession: BlogSession
let markSessionDirty: Mock<() => void>

beforeEach(async () => {
  initAllBatchers(getDatabaseHandle())
  setBlogSettingsBundleForTests(MAGIC_LINK_TEST_BUNDLE)
  await clearAllTables(db)
  await seedGateAdmin()
  __resetRateLimitsForTests()
  testSession = makeSession({})
  testSession.set('csrfToken', CSRF_TOKEN)
  markSessionDirty = vi.fn<() => void>()
  await mail.drain()
  mail.applyCaptureMail()
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
  mail.restore()
})

afterAll(async () => {
  await mail.close()
})

const TEST_PASSWORD = 'correcthorsebatterystaple'

async function seedGateAdmin() {
  await sqliteOf(db).insert(user).values({
    name: 'Gatekeeper',
    email: 'gatekeeper@example.com',
    password: 'not-a-real-hash',
    role: 'admin',
  })
}

async function seedUser(loginMethod: 'password' | 'magic-link' | 'passkey', email = 'admin@example.com') {
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 12)
  const [inserted] = await sqliteOf(db)
    .insert(user)
    .values({
      name: 'Admin',
      email,
      emailVerified: true,
      link: '',
      password: hashedPassword,
      role: 'admin',
      badgeName: 'MOD',
      badgeColor: '#007a82',
      receiveEmail: true,
      loginMethod,
    })
    .returning()
  return inserted
}

function setContext(action: string | null, redirectTo = '/admin', clientAddress = '127.0.0.1') {
  const params = new URLSearchParams()
  if (action) {
    params.set('action', action)
  }
  params.set('redirect_to', redirectTo)
  const url = new URL(`http://localhost/admin/signin?${params.toString()}`)
  return makeRouteContext({
    session: testSession,
    clientAddress,
    db,
    request: new Request(url),
    markSessionDirty,
  })
}

async function callAction(
  actionName: string | null,
  formData: FormData,
  redirectTo = '/admin',
  clientAddress = '127.0.0.1',
  requestUrl = 'http://localhost/admin/signin',
): Promise<Response & { data?: any }> {
  const routeContext = setContext(actionName, redirectTo, clientAddress)
  const url = new URL(requestUrl)
  const request = new Request(requestUrl, {
    method: 'POST',
    body: formData,
  })
  try {
    return (await action({
      request,
      url,
      context: routeContext,
      params: {},
      pattern: 'admin/signin',
    })) as Response
  } catch (error) {
    if (error instanceof Response) {
      return error
    }
    throw error
  }
}

async function callLoader(search: string): Promise<Response & { data?: any }> {
  const url = new URL(`http://localhost/admin/signin${search}`)
  const routeContext = makeRouteContext({ session: testSession, db, request: new Request(url), markSessionDirty })
  try {
    return (await loader({
      request: new Request(url),
      url,
      context: routeContext,
      params: {},
      pattern: 'admin/signin',
    })) as unknown as Response
  } catch (error) {
    if (error instanceof Response) {
      return error
    }
    throw error
  }
}

function emailFormData(email = 'admin@example.com') {
  const fd = new FormData()
  fd.set('email', email)
  fd.set('csrf_token', CSRF_TOKEN)
  return fd
}

function magicLinkFormData(token: string) {
  const fd = new FormData()
  fd.set('magic_token', token)
  fd.set('csrf_token', CSRF_TOKEN)
  return fd
}

async function getLinkRow(userId: number) {
  const rows = await sqliteOf(db)
    .select()
    .from(verification)
    .where(and(eq(verification.purpose, 'signin-link'), eq(verification.userId, userId)))
  return rows[0] ?? null
}

async function auditRowsFor(actionName: string) {
  await flushAuditLog()
  return sqliteOf(db).select().from(auditLog).where(eq(auditLog.action, actionName))
}

function linkFromBody(body: string): string {
  const match = /https?:\/\/[^\s"'<]*token=[^\s"'<]+/.exec(body.replace(/&amp;/g, '&'))
  expect(match).not.toBeNull()
  return match![0]!
}

async function extractLinkFromMail(): Promise<string> {
  return linkFromBody((await parseMail(mail)).body)
}

async function identifyAndExtractToken(email = 'admin@example.com'): Promise<string> {
  await callAction('identify', emailFormData(email))
  const token = new URL(await extractLinkFromMail()).searchParams.get('token')
  expect(token).toBeTruthy()
  return token as string
}

describe('integration: magic-link signin flow (real DB)', () => {
  it('identify sends a link and stages a signin-link token for a magic-link user', async () => {
    const admin = await seedUser('magic-link')

    const result = await callAction('identify', emailFormData())
    expect(result.data?.message).toBe('如果该邮箱已注册，登录链接已发送，请查收邮箱。')

    const sent = await parseMail(mail)
    expect(sent.to).toBe('admin@example.com')
    const link = linkFromBody(sent.body)
    expect(link.startsWith(`${MAGIC_LINK_TEST_BUNDLE.siteIdentity!.website}/admin/signin?action=magiclink`)).toBe(true)
    expect(link).toContain('token=')
    expect(link).toContain('redirect_to=%2Fadmin')

    const row = await getLinkRow(admin.id)
    expect(row).not.toBeNull()
    expect(row!.purpose).toBe('signin-link')

    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  it('builds the emailed link from the configured site origin, never the request Host', async () => {
    await seedUser('magic-link')

    await callAction('identify', emailFormData(), '/admin', '127.0.0.1', 'http://evil.tld/admin/signin')
    const link = linkFromBody((await parseMail(mail)).body)
    expect(link.startsWith('https://example.com/admin/signin?action=magiclink')).toBe(true)
    expect(link).not.toContain('evil.tld')
  })

  it('identify answers unknown emails exactly like a magic-link send (no existence oracle)', async () => {
    const result = await callAction('identify', emailFormData('ghost@example.com'))

    expect(result.data?.message).toBe('如果该邮箱已注册，登录链接已发送，请查收邮箱。')
    expect(await mail.noMessage()).toBe(true)
  })

  it('identify answers method=password for a regular user', async () => {
    await seedUser('password')
    const result = await callAction('identify', emailFormData())
    expect(result.data?.method).toBe('password')
    expect(await mail.noMessage()).toBe(true)
  })

  it('identify answers method=passkey for a passkey-method user', async () => {
    await seedUser('passkey')
    const result = await callAction('identify', emailFormData())
    expect(result.data?.method).toBe('passkey')
    expect(await mail.noMessage()).toBe(true)
  })

  it('full round-trip: identify → emailed link → confirm consumes token and establishes session', async () => {
    const admin = await seedUser('magic-link')
    const token = await identifyAndExtractToken()

    const peeked = await callLoader(`?action=magiclink&token=${encodeURIComponent(token)}`)
    expect(peeked.data?.action).toBe('magiclink')
    expect(peeked.data?.magicToken).toBe(token)
    expect(await getLinkRow(admin.id)).not.toBeNull()

    const result = await callAction('magiclink', magicLinkFormData(token))

    expect(result.status).toBe(302)
    expect(result.headers.get('Location')).toBe('/admin')
    expect(result.headers.get('Set-Cookie')).toMatch(/^__session=/)

    const sessions = await sqliteOf(db).select().from(sessionTable).where(eq(sessionTable.userId, admin.id))
    expect(sessions).toHaveLength(1)

    const logins = await auditRowsFor('login')
    expect(logins).toHaveLength(1)
    expect(logins[0]!.resourceId).toBe(sessions[0]!.id)
    expect(logins[0]!.actorId).toBe(admin.id)
    expect(logins[0]!.details).toMatchObject({ method: 'magic-link' })

    expect(await getLinkRow(admin.id)).toBeNull()
    const replay = await callAction('magiclink', magicLinkFormData(token))
    expect(replay.data?.error).toBe('链接无效或已过期，请重新获取。')
  })

  it('expired token is rejected by both the loader peek and the consume', async () => {
    const admin = await seedUser('magic-link')
    const token = await identifyAndExtractToken()

    await sqliteOf(db)
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(and(eq(verification.purpose, 'signin-link'), eq(verification.userId, admin.id)))

    const peeked = await callLoader(`?action=magiclink&token=${encodeURIComponent(token)}`)
    expect(peeked.data?.tokenError).toBe('链接无效或已过期。')
    expect(peeked.data?.magicToken).toBeNull()

    const result = await callAction('magiclink', magicLinkFormData(token))
    expect(result.data?.error).toBe('链接无效或已过期，请重新获取。')
    expect(await sqliteOf(db).select().from(sessionTable).where(eq(sessionTable.userId, admin.id))).toHaveLength(0)
  })

  it('rate limiting blocks the 4th link send', async () => {
    await seedUser('magic-link')
    const uniqueIp = '127.0.0.77'

    for (let i = 0; i < 3; i++) {
      await callAction('identify', emailFormData(), '/admin', uniqueIp)
    }
    for (let i = 0; i < 3; i++) {
      await parseMail(mail)
    }

    const result = await callAction('identify', emailFormData(), '/admin', uniqueIp)
    expect(result.data?.error).toBe('发送过于频繁，请稍后再试。')
    expect(await mail.noMessage()).toBe(true)
  })

  it('records a magic_link_sent audit event', async () => {
    const admin = await seedUser('magic-link')
    await callAction('identify', emailFormData())

    const sent = await auditRowsFor('magic_link_sent')
    expect(sent).toHaveLength(1)
    expect(sent[0]!.resourceType).toBe('user')
    expect(sent[0]!.resourceId).toBe(String(admin.id))
  })
})
