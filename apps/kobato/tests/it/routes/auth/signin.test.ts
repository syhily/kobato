import type { BlogSession } from '@kobato/server/domains/auth/session-storage'
import type { BlogSettingsBundle } from '@kobato/settings/types'
import type { Mock } from 'vitest'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { auditLog } from '@kobato/db/sqlite/schema/config'
import { session as sessionTable } from '@kobato/db/sqlite/schema/session'
import { user, verification } from '@kobato/db/sqlite/schema/user'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { issueSignInLinkToken } from '@kobato/server/domains/auth/verification-tokens'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import { createCaptureMailFixture, parseMail } from '@kobato/server/tests/utils/capture-mail'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { adminUser, makeSession } from '@kobato/server/tests/utils/session'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings'
import { makeRouteContext } from '@tests/utils/context'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = getTestDb()
const mail = await createCaptureMailFixture()

const CSRF_TOKEN = 'signin-route-csrf-token'

const MAIL_READY_BUNDLE = {
  ...TEST_BLOG_SETTINGS_BUNDLE,
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
    otpSend: { windowSeconds: 60, maxAttempts: 10 },
    otpVerify: { windowSeconds: 60, maxAttempts: 10 },
  },
} as BlogSettingsBundle

const PASSKEY_ON_BUNDLE = {
  ...TEST_BLOG_SETTINGS_BUNDLE,
  security: { ...TEST_BLOG_SETTINGS_BUNDLE.security!, passkey: { enabled: true } },
} as BlogSettingsBundle

function withBucket(
  base: BlogSettingsBundle,
  bucket: keyof NonNullable<BlogSettingsBundle['rateLimit']>,
  maxAttempts: number,
): BlogSettingsBundle {
  return {
    ...base,
    rateLimit: { ...base.rateLimit!, [bucket]: { windowSeconds: 60, maxAttempts } },
  } as BlogSettingsBundle
}

const { action, loader } = await import('@/routes/auth/signin')

let testSession: BlogSession
let markSessionDirty: Mock<() => void>

beforeEach(async () => {
  initAllBatchers(getDatabaseHandle())
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
  mail.restore()
  resetAllBatchers()
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

async function seedUser(overrides: Record<string, unknown> = {}) {
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 12)
  const [inserted] = await sqliteOf(db)
    .insert(user)
    .values({
      name: 'Admin',
      email: 'admin@example.com',
      emailVerified: true,
      link: '',
      password: hashedPassword,
      role: 'admin',
      receiveEmail: true,
      ...overrides,
    })
    .returning()
  return inserted!
}

function setContext(action: string | null, redirectTo: string | null = '/admin', clientAddress = '127.0.0.1') {
  const params = new URLSearchParams()
  if (action) {
    params.set('action', action)
  }
  if (redirectTo !== null) {
    params.set('redirect_to', redirectTo)
  }
  const url = new URL(`http://localhost/admin/signin?${params.toString()}`)
  return makeRouteContext({ session: testSession, clientAddress, db, request: new Request(url), markSessionDirty })
}

async function callAction(
  actionName: string | null,
  formData: FormData,
  redirectTo: string | null = '/admin',
  clientAddress = '127.0.0.1',
): Promise<Response & { data?: any }> {
  const routeContext = setContext(actionName, redirectTo, clientAddress)
  const url = new URL('http://localhost/admin/signin')
  const request = new Request(url, { method: 'POST', body: formData })
  try {
    return (await action({
      request,
      url,
      context: routeContext,
      params: {},
      pattern: 'admin/signin',
    })) as Response & { data?: any }
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
    })) as unknown as Response & { data?: any }
  } catch (error) {
    if (error instanceof Response) {
      return error
    }
    throw error
  }
}

function withCsrf(fd: FormData = new FormData()): FormData {
  fd.set('csrf_token', CSRF_TOKEN)
  return fd
}

function loginFormData(email = 'admin@example.com', password = TEST_PASSWORD) {
  const fd = new FormData()
  fd.set('email', email)
  fd.set('password', password)
  return withCsrf(fd)
}

function otpFormData(code: string) {
  const fd = new FormData()
  fd.set('otp_code', code)
  return withCsrf(fd)
}

function emailFormData(email: string) {
  const fd = new FormData()
  fd.set('email', email)
  return withCsrf(fd)
}

function getSetCookie(result: Response & { data?: any }): string | null {
  if (result.headers instanceof Headers) {
    return result.headers.get('Set-Cookie')
  }
  const init = (result as { init?: { headers?: Record<string, string> } }).init
  return init?.headers?.['Set-Cookie'] ?? null
}

function extractData(result: unknown): Record<string, unknown> {
  return (result as { data?: Record<string, unknown> }).data ?? {}
}

async function extractOtpFromMail(): Promise<string> {
  const sent = await parseMail(mail)
  const match = /\b\d{6}\b/.exec(sent.body.replace(/#[0-9a-fA-F]{3,8}/g, ''))
  expect(match).not.toBeNull()
  return match![0]!
}

async function doLogin(clientAddress = '127.0.0.1'): Promise<string> {
  await callAction(null, loginFormData(), '/admin', clientAddress)
  return extractOtpFromMail()
}

function wrongOtp(code: string): string {
  return code === '000000' ? '111111' : '000000'
}

async function getOtpRow(userId: number) {
  const rows = await sqliteOf(db)
    .select()
    .from(verification)
    .where(and(eq(verification.purpose, 'signin-otp'), eq(verification.userId, userId)))
  return rows[0] ?? null
}

function stagePendingOtp(userId: number | string, overrides: Record<string, unknown> = {}) {
  testSession.set('pendingOtpUser', {
    userId: String(userId),
    email: 'admin@example.com',
    expiresAt: Date.now() + 5 * 60 * 1000,
    sentAt: Date.now(),
    ...overrides,
  })
}

async function sessionRowsFor(userId: number) {
  return sqliteOf(db).select().from(sessionTable).where(eq(sessionTable.userId, userId))
}

async function auditRowsFor(actionName: string) {
  await flushAuditLog()
  return sqliteOf(db).select().from(auditLog).where(eq(auditLog.action, actionName))
}

describe('routes/signin', () => {
  it('sanitizes external already-logged-in redirect targets', async () => {
    testSession.set('user', adminUser())
    const response = await callLoader('?redirect_to=//evil.example/phish')

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/')
  })

  it('passes only a sanitized redirect target into login form handling', async () => {
    const result = await callAction(null, withCsrf(), 'https://evil.example/phish')

    expect(extractData(result).redirectTo).toBe('/admin')
  })

  it('rejects redirect targets whose dot segments normalize to a network-path reference', async () => {
    testSession.set('user', adminUser())
    for (const target of ['/..//evil.example/phish', '/a/..//evil.example/phish', '/%2e%2e//evil.example']) {
      const response = await callLoader(`?redirect_to=${encodeURIComponent(target)}`)

      expect(response.status, target).toBe(302)
      expect(response.headers.get('location'), target).toBe('/')
    }
  })

  it('rejects dot-segment redirect targets before they reach the login form', async () => {
    const result = await callAction(null, withCsrf(), '/..//evil.example/phish')

    expect(extractData(result).redirectTo).toBe('/admin')
  })

  it('falls back to the login view for POST-only action names', async () => {
    for (const name of ['identify', 'passkey', 'verifyotp', 'resendotp', 'cancelotp']) {
      const result = await callLoader(`?action=${name}`)
      expect(extractData(result).action).toBe('login')
    }
  })

  it('keeps GET view actions as views', async () => {
    const result = await callLoader('?action=lostpassword')
    expect(extractData(result).action).toBe('lostpassword')
  })

  it('returns verifyotp action when pendingOtpUser exists', async () => {
    stagePendingOtp(1)

    const result = await callLoader('')
    const d = extractData(result)

    expect(d.action).toBe('verifyotp')
    expect(d.pendingOtpEmail).toBe('admin@example.com')
    expect(d.pendingOtpSentAt).toBeDefined()
  })

  it('redirects to login when pendingOtpUser is expired', async () => {
    stagePendingOtp(1, { expiresAt: Date.now() - 1, sentAt: Date.now() - 10 * 60 * 1000 })

    const response = await callLoader('')

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/admin/signin?redirect_to=%2F')

    expect(markSessionDirty).toHaveBeenCalledTimes(1)
    expect(response.headers.get('Set-Cookie')).toBeNull()
    expect(testSession.get('pendingOtpUser')).toBeUndefined()
    expect(testSession.get('otpFailCount')).toBeUndefined()
  })
})

describe('routes/signin — install gate', () => {
  it('loader redirects to /admin/setup when no admin exists', async () => {
    await sqliteOf(db).delete(user)

    const response = await callLoader('')

    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/admin/setup')
  })

  it('action redirects to /admin/setup when no admin exists', async () => {
    await sqliteOf(db).delete(user)

    const response = await callAction(null, loginFormData())

    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/admin/setup')
  })
})

describe('routes/signin — OTP (real db + tokens)', () => {
  beforeEach(() => {
    setBlogSettingsBundleForTests(MAIL_READY_BUNDLE)
    mail.applyCaptureMail()
  })

  it('issues OTP and sends email when mail is ready', async () => {
    const admin = await seedUser()

    const result = await callAction(null, loginFormData())

    const otpCode = await extractOtpFromMail()
    expect(markSessionDirty).toHaveBeenCalled()
    expect(testSession.get('pendingOtpUser')).toEqual(
      expect.objectContaining({ userId: String(admin.id), email: 'admin@example.com' }),
    )
    expect(testSession.get('otpFailCount')).toBe(0)

    expect(markSessionDirty).toHaveBeenCalled()
    expect(getSetCookie(result)).toBeNull()

    const row = await getOtpRow(admin.id)
    expect(row).not.toBeNull()
    expect(row!.value).not.toContain(otpCode)
  })

  it('does NOT trigger OTP when mail is not ready', async () => {
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    const admin = await seedUser()

    const result = await callAction(null, loginFormData())

    expect(await mail.noMessage()).toBe(true)

    expect(getSetCookie(result)).toMatch(/^__session=/)
    expect(await sessionRowsFor(admin.id)).toHaveLength(1)
    expect(markSessionDirty).not.toHaveBeenCalled()
    expect(await sqliteOf(db).select().from(verification)).toHaveLength(0)
  })

  it('blocks OTP send when rate limit is exceeded', async () => {
    setBlogSettingsBundleForTests(withBucket(MAIL_READY_BUNDLE, 'otpSend', 1))
    mail.applyCaptureMail()
    await seedUser()

    await callAction(null, loginFormData())
    await parseMail(mail)
    testSession.unset('pendingOtpUser')
    testSession.unset('otpFailCount')
    markSessionDirty.mockClear()

    const result = await callAction(null, loginFormData())

    expect(extractData(result).error).toBe('发送过于频繁，请稍后再试。')
    expect(await mail.noMessage()).toBe(true)
    expect(markSessionDirty).not.toHaveBeenCalled()
    expect(getSetCookie(result)).toBeNull()
  })

  it('verifies OTP successfully and establishes session', async () => {
    const admin = await seedUser()
    const otpCode = await doLogin()

    const result = await callAction('verifyotp', otpFormData(otpCode))

    const sessions = await sessionRowsFor(admin.id)
    expect(sessions).toHaveLength(1)
    expect(getSetCookie(result)).toMatch(/^__session=/)
    const logins = await auditRowsFor('login')
    expect(logins).toHaveLength(1)
    expect(logins[0]!.resourceId).toBe(sessions[0]!.id)
    expect(logins[0]!.actorId).toBe(admin.id)
    expect(logins[0]!.details).toMatchObject({ method: 'otp' })

    expect(testSession.get('pendingOtpUser')).toBeUndefined()

    expect(markSessionDirty).toHaveBeenCalled()
    expect(await getOtpRow(admin.id)).toBeNull()
  })

  it('fails verification with wrong OTP code', async () => {
    const admin = await seedUser()
    const otpCode = await doLogin()
    markSessionDirty.mockClear()

    const result = await callAction('verifyotp', otpFormData(wrongOtp(otpCode)))

    expect(testSession.get('otpFailCount')).toBe(1)
    expect(markSessionDirty).toHaveBeenCalled()
    expect(getSetCookie(result)).toBeNull()
    expect(await getOtpRow(admin.id)).not.toBeNull()
  })

  it('locks out after 3 failed OTP attempts', async () => {
    await seedUser()
    const otpCode = await doLogin()

    for (let i = 0; i < 3; i++) {
      await callAction('verifyotp', otpFormData(wrongOtp(otpCode)))
    }

    expect(testSession.get('pendingOtpUser')).toBeUndefined()
    expect(markSessionDirty).toHaveBeenCalled()

    const failures = await auditRowsFor('otp_failed')
    const lockout = failures.find((row) => (row.details as Record<string, unknown> | null)?.lockedOut === true)
    expect(lockout).toBeDefined()
    expect((lockout!.details as Record<string, unknown>).failCount).toBe(3)
  })

  it('resends OTP and resets fail count', async () => {
    await seedUser()
    const oldCode = await doLogin()
    testSession.set('otpFailCount', 2)
    markSessionDirty.mockClear()

    const result = await callAction('resendotp', withCsrf())

    const newCode = await extractOtpFromMail()
    expect(newCode).not.toBe(oldCode)
    expect(testSession.get('otpFailCount')).toBe(0)
    expect(markSessionDirty).toHaveBeenCalled()
    expect(getSetCookie(result)).toBeNull()
  })

  it('cancels OTP flow and clears pending state', async () => {
    await seedUser()
    await doLogin()

    const result = await callAction('cancelotp', withCsrf())

    expect(testSession.get('pendingOtpUser')).toBeUndefined()
    expect(testSession.get('otpFailCount')).toBeUndefined()
    expect(markSessionDirty).toHaveBeenCalled()
    expect(getSetCookie(result)).toBeNull()
  })

  it('blocks OTP verify when rate limit is exceeded', async () => {
    setBlogSettingsBundleForTests(withBucket(MAIL_READY_BUNDLE, 'otpVerify', 2))
    mail.applyCaptureMail()
    const admin = await seedUser()
    const otpCode = await doLogin()

    await callAction('verifyotp', otpFormData(wrongOtp(otpCode)))
    await callAction('verifyotp', otpFormData(wrongOtp(otpCode)))
    markSessionDirty.mockClear()

    await callAction('verifyotp', otpFormData(otpCode))

    expect(await sessionRowsFor(admin.id)).toHaveLength(0)
    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  it('rejects invalid email/password (schema validation)', async () => {
    const result = await callAction(null, loginFormData('not-an-email', ''))

    expect(extractData(result).error).toBe('请填写正确的邮箱和密码。')
    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  it('blocks login when login rate limit exceeded', async () => {
    setBlogSettingsBundleForTests(withBucket(MAIL_READY_BUNDLE, 'signIn', 1))
    mail.applyCaptureMail()
    await seedUser()

    await callAction(null, loginFormData())
    markSessionDirty.mockClear()

    const result = await callAction(null, loginFormData())

    expect(extractData(result).error).toBe('登录失败次数过多，请稍后再试。')
    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  it('wrong password returns redirect without triggering OTP', async () => {
    await seedUser()

    const result = await callAction(null, loginFormData('admin@example.com', 'wrong-password-123'))

    expect(result.status).toBe(302)
    expect(result.headers.get('Location')).toContain('error=invalid_credentials')
    expect(getSetCookie(result)).toBeNull()
    expect(markSessionDirty).not.toHaveBeenCalled()
    expect(await mail.noMessage()).toBe(true)
    expect(await sqliteOf(db).select().from(verification)).toHaveLength(0)
  })

  it('returns error when first-time OTP email send fails', async () => {
    await seedUser()
    mail.useDeadTransport()

    const result = await callAction(null, loginFormData())

    expect(extractData(result).error).toBe('验证码发送失败，请稍后重试。')
    expect(testSession.get('pendingOtpUser')).toBeUndefined()

    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  it('rejects verifyotp when no pendingOtpUser in session', async () => {
    const result = await callAction('verifyotp', otpFormData('123456'))

    expect(extractData(result).error).toBe('请先完成登录。')
    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  it('returns error when OTP valid but user not found', async () => {
    const admin = await seedUser()
    const otpCode = await doLogin()

    await sqliteOf(db).delete(user).where(eq(user.id, admin.id))
    markSessionDirty.mockClear()

    const result = await callAction('verifyotp', otpFormData(otpCode))

    expect(extractData(result).error).toBe('账户状态异常，无法登录。')

    expect(markSessionDirty).toHaveBeenCalled()
    expect(getSetCookie(result)).toBeNull()
    expect(await sqliteOf(db).select().from(sessionTable)).toHaveLength(0)
  })

  it('cleans up otpFailCount on successful verification', async () => {
    await seedUser()
    const otpCode = await doLogin()
    testSession.set('otpFailCount', 2)

    const result = await callAction('verifyotp', otpFormData(otpCode))

    expect(testSession.get('otpFailCount')).toBeUndefined()
    expect(markSessionDirty).toHaveBeenCalled()
    expect(getSetCookie(result)).toMatch(/^__session=/)
  })

  it('rejects resend when no pendingOtpUser in session', async () => {
    const result = await callAction('resendotp', withCsrf())

    expect(extractData(result).error).toBe('请先完成登录。')
    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  it('returns error when email send fails on resend', async () => {
    await seedUser()
    await doLogin()
    mail.useDeadTransport()
    markSessionDirty.mockClear()

    const result = await callAction('resendotp', withCsrf())

    expect(extractData(result).error).toBe('验证码发送失败，请稍后重试。')
    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  it('updates pendingOtpUser with new expiresAt and sentAt on resend', async () => {
    const admin = await seedUser()
    await doLogin()
    const oldExpires = Date.now() + 60 * 1000
    const oldSent = Date.now() - 4 * 60 * 1000
    stagePendingOtp(admin.id, { expiresAt: oldExpires, sentAt: oldSent })

    await callAction('resendotp', withCsrf())

    const updated = testSession.get('pendingOtpUser') as { expiresAt: number; sentAt: number }
    expect(updated.expiresAt).toBeGreaterThan(oldExpires)
    expect(updated.sentAt).toBeGreaterThan(oldSent)
    expect(markSessionDirty).toHaveBeenCalled()
  })

  it('blocks resend when rate limit exceeded', async () => {
    setBlogSettingsBundleForTests(withBucket(MAIL_READY_BUNDLE, 'otpSend', 1))
    mail.applyCaptureMail()
    await seedUser()
    await doLogin()
    markSessionDirty.mockClear()

    const result = await callAction('resendotp', withCsrf())

    expect(extractData(result).error).toBe('发送过于频繁，请稍后再试。')
    expect(await mail.noMessage()).toBe(true)
    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  it('preserves redirectTo in cancel redirect', async () => {
    await seedUser()
    await doLogin()

    const result = await callAction('cancelotp', withCsrf(), '/admin/posts')

    expect(result.status).toBe(302)
    expect(result.headers.get('location')).toContain(encodeURIComponent('/admin/posts'))
  })
})

describe('routes/signin — identify (real db)', () => {
  it('rejects malformed email', async () => {
    const result = await callAction('identify', emailFormData('not-an-email'))
    expect(extractData(result).error).toBe('请填写正确的邮箱地址。')
  })

  it('answers unknown email exactly like a magic-link send (no existence oracle)', async () => {
    const result = await callAction('identify', emailFormData('ghost@example.com'))

    expect(extractData(result).message).toBe('如果该邮箱已注册，登录链接已发送，请查收邮箱。')

    expect(await mail.noMessage()).toBe(true)
    expect(await sqliteOf(db).select().from(verification)).toHaveLength(0)
  })

  it('returns method=password for a regular user', async () => {
    await seedUser({ loginMethod: 'password' })

    const result = await callAction('identify', emailFormData('admin@example.com'))
    expect(extractData(result).method).toBe('password')
  })

  it('returns method=passkey for a passkey-method user when passkey is enabled', async () => {
    setBlogSettingsBundleForTests(PASSKEY_ON_BUNDLE)
    await seedUser({ loginMethod: 'passkey' })

    const result = await callAction('identify', emailFormData('admin@example.com'))
    expect(extractData(result).method).toBe('passkey')
  })

  it('degrades a passkey-method user to password when the global switch is off', async () => {
    await seedUser({ loginMethod: 'passkey' })

    const result = await callAction('identify', emailFormData('admin@example.com'))
    expect(extractData(result).method).toBe('password')
  })

  it('sends a magic link for a magic-link user when mail is ready', async () => {
    setBlogSettingsBundleForTests(MAIL_READY_BUNDLE)
    mail.applyCaptureMail()
    mail.applyCaptureMail()
    const admin = await seedUser({ loginMethod: 'magic-link' })

    const result = await callAction('identify', emailFormData('admin@example.com'))
    expect(extractData(result).message).toBe('如果该邮箱已注册，登录链接已发送，请查收邮箱。')

    const sent = await parseMail(mail)
    expect(sent.to).toBe('admin@example.com')
    expect(sent.body).toContain('action=magiclink')
    const rows = await sqliteOf(db)
      .select()
      .from(verification)
      .where(and(eq(verification.purpose, 'signin-link'), eq(verification.userId, admin.id)))
    expect(rows).toHaveLength(1)
  })

  it('degrades a magic-link user to password when mail is not ready', async () => {
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    await seedUser({ loginMethod: 'magic-link' })

    const result = await callAction('identify', emailFormData('admin@example.com'))
    expect(extractData(result).method).toBe('password')

    expect(await mail.noMessage()).toBe(true)
    expect(await sqliteOf(db).select().from(verification)).toHaveLength(0)
  })

  it('blocks identify when rate limit is exceeded', async () => {
    setBlogSettingsBundleForTests(withBucket(TEST_BLOG_SETTINGS_BUNDLE, 'signIn', 1))

    await callAction('identify', emailFormData('admin@example.com'))

    const result = await callAction('identify', emailFormData('admin@example.com'))
    expect(extractData(result).error).toBe('登录失败次数过多，请稍后再试。')
  })
})

describe('routes/signin — passkey finish dispatch (real db)', () => {
  function passkeyFormData(response?: string, challenge?: string): FormData {
    const fd = new FormData()
    if (response !== undefined) {
      fd.set('passkey_response', response)
    }
    if (challenge !== undefined) {
      fd.set('passkey_challenge', challenge)
    }
    return withCsrf(fd)
  }

  it('dispatches action=passkey through account.passkey.authFinish and maps the invalid-JSON error', async () => {
    setBlogSettingsBundleForTests(PASSKEY_ON_BUNDLE)
    await seedUser()

    const result = await callAction('passkey', passkeyFormData('{not-json', 'challenge-value'))

    expect(extractData(result).error).toBe('Passkey 响应格式错误。')
    expect((extractData(result).errorDescriptor as { messageKey: string }).messageKey).toBe(
      'auth.passkey.error.responseInvalid',
    )
    expect(await sqliteOf(db).select().from(sessionTable)).toHaveLength(0)
  })

  it('requires the challenge field before parsing the passkey response', async () => {
    setBlogSettingsBundleForTests(PASSKEY_ON_BUNDLE)
    await seedUser()

    const result = await callAction('passkey', passkeyFormData('{"id":"c"}'))

    expect(extractData(result).error).toBe('Passkey 响应缺失。')
    expect((extractData(result).errorDescriptor as { messageKey: string }).messageKey).toBe(
      'auth.passkey.error.responseMissing',
    )
    expect(await sqliteOf(db).select().from(sessionTable)).toHaveLength(0)
  })

  it('answers with the disabled copy when the passkey switch is off', async () => {
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    await seedUser()

    const result = await callAction('passkey', passkeyFormData('{"id":"c"}', 'challenge-value'))

    expect(extractData(result).error).toBe('Passkey 登录未启用。')
    expect((extractData(result).errorDescriptor as { messageKey: string }).messageKey).toBe(
      'auth.passkey.error.disabled',
    )
  })
})

describe('routes/signin — magic-link consume (real db + tokens)', () => {
  it('rejects an invalid or expired token', async () => {
    const fd = new FormData()
    fd.set('magic_token', 'bogus-token')
    const result = await callAction('magiclink', withCsrf(fd))
    expect(extractData(result).error).toBe('链接无效或已过期，请重新获取。')

    expect(await sqliteOf(db).select().from(sessionTable)).toHaveLength(0)
  })

  it('establishes a session for a valid token', async () => {
    const admin = await seedUser({ loginMethod: 'magic-link' })
    const { token } = issueSignInLinkToken(db, admin.id)

    const fd = new FormData()
    fd.set('magic_token', token)
    const result = await callAction('magiclink', withCsrf(fd))

    const sessions = await sessionRowsFor(admin.id)
    expect(sessions).toHaveLength(1)
    expect(result.status).toBe(302)
    expect(getSetCookie(result)).toMatch(/^__session=/)
    const logins = await auditRowsFor('login')
    expect(logins).toHaveLength(1)
    expect(logins[0]!.resourceId).toBe(sessions[0]!.id)
    expect(logins[0]!.details).toMatchObject({ method: 'magic-link' })

    const replay = await callAction('magiclink', withCsrf(fd))
    expect(extractData(replay).error).toBe('链接无效或已过期，请重新获取。')
  })
})
