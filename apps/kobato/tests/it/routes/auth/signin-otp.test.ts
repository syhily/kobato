import type { AppLocale } from '@kobato/i18n/locales.ts'
import type { BlogSession } from '@kobato/server/domains/auth/session-storage.ts'
import type { BlogSettingsBundle } from '@kobato/settings/types.ts'
import type { Mock } from 'vitest'

import { auditLog } from '@kobato/db/schema/config.ts'
import { session as sessionTable } from '@kobato/db/schema/session.ts'
import { user, verification } from '@kobato/db/schema/user.ts'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle.ts'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher.ts'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry.ts'
import { __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit.ts'
import { createCaptureMailFixture, parseMail } from '@kobato/server/tests/utils/capture-mail.ts'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db.ts'
import { makeSession } from '@kobato/server/tests/utils/session.ts'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings.ts'
import { makeRouteContext } from '@tests/utils/context.ts'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = getTestDb()
const mail = await createCaptureMailFixture()

const CSRF_TOKEN = 'signin-otp-csrf-token'

const OTP_TEST_BUNDLE = {
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
    otpSend: { windowSeconds: 60, maxAttempts: 3 },
    otpVerify: { windowSeconds: 60, maxAttempts: 10 },
  },
} as BlogSettingsBundle

const { action } = await import('@/routes/auth/signin.tsx')

let testSession: BlogSession
let markSessionDirty: Mock<() => void>

beforeEach(async () => {
  initAllBatchers(getDatabaseHandle())
  setBlogSettingsBundleForTests(OTP_TEST_BUNDLE)
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
  await db.insert(user).values({
    name: 'Gatekeeper',
    email: 'gatekeeper@example.com',
    password: 'not-a-real-hash',
    role: 'admin',
  })
}

async function seedAdminUser() {
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 12)
  const [inserted] = await db
    .insert(user)
    .values({
      name: 'Admin',
      email: 'admin@example.com',
      emailVerified: true,
      link: '',
      password: hashedPassword,
      role: 'admin',
      badgeName: 'MOD',
      badgeColor: '#007a82',
      receiveEmail: true,
    })
    .returning()
  return inserted
}

function setContext(
  action: string | null,
  redirectTo = '/admin',
  clientAddress = '127.0.0.1',
  locale: AppLocale = 'zh-CN',
) {
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
    localization: { locale, timeZone: 'UTC', timeFormat: null, revision: 'boot-test:0000000000' },
  })
}

async function callAction(
  actionName: string | null,
  formData: FormData,
  redirectTo = '/admin',
  clientAddress = '127.0.0.1',
  locale: AppLocale = 'zh-CN',
): Promise<Response & { data?: any }> {
  const routeContext = setContext(actionName, redirectTo, clientAddress, locale)
  const url = new URL(`http://localhost/admin/signin`)
  const request = new Request('http://localhost/admin/signin', {
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

function getSetCookie(result: Response & { data?: any }): string | null {
  if (result.headers instanceof Headers) {
    return result.headers.get('Set-Cookie')
  }
  const init = (result as { init?: { headers?: Record<string, string> } }).init
  return init?.headers?.['Set-Cookie'] ?? null
}

// The OTP code out of the actually-delivered email — the e2e pattern.
async function extractOtpFromMail(): Promise<string> {
  const sent = await parseMail(mail)
  // Hex colors in the template styling (e.g. #334155) are 6-digit noise.
  const match = /\b\d{6}\b/.exec(sent.body.replace(/#[0-9a-fA-F]{3,8}/g, ''))
  expect(match).not.toBeNull()
  return match![0]!
}

async function doLogin(): Promise<string> {
  await callAction(null, loginFormData())
  return extractOtpFromMail()
}

async function getOtpRow(userId: number) {
  const rows = await db
    .select()
    .from(verification)
    .where(and(eq(verification.purpose, 'signin-otp'), eq(verification.userId, userId)))
  return rows[0] ?? null
}

async function sessionRowsFor(userId: number) {
  return db.select().from(sessionTable).where(eq(sessionTable.userId, userId))
}

async function auditRowsFor(actionName: string) {
  await flushAuditLog()
  return db.select().from(auditLog).where(eq(auditLog.action, actionName))
}

describe('integration: OTP login flow (real DB)', () => {
  it('full happy path: login → OTP → verify → session established', async () => {
    const admin = await seedAdminUser()

    const loginResult = await callAction(null, loginFormData())
    const otpCode = await extractOtpFromMail()
    expect(markSessionDirty).toHaveBeenCalled()
    expect(loginResult.headers.get('Set-Cookie')).toBeNull()
    markSessionDirty.mockClear()

    const row = await getOtpRow(admin.id)
    expect(row).not.toBeNull()
    expect(row!.purpose).toBe('signin-otp')

    expect(testSession.get('pendingOtpUser')).toEqual(
      expect.objectContaining({
        userId: String(admin.id),
        email: 'admin@example.com',
      }),
    )
    expect(testSession.get('otpFailCount')).toBe(0)

    const result = await callAction('verifyotp', otpFormData(otpCode))

    expect(result.status).toBe(302)
    expect(result.headers.get('Location')).toBe('/admin')

    expect(result.headers.get('Set-Cookie')).toMatch(/^__session=/)

    const sessions = await sessionRowsFor(admin.id)
    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.loginAt).not.toBeNull()

    const logins = await auditRowsFor('login')
    expect(logins).toHaveLength(1)
    expect(logins[0]!.resourceType).toBe('session')
    expect(logins[0]!.resourceId).toBe(sessions[0]!.id)
    expect(logins[0]!.actorId).toBe(admin.id)
    expect(logins[0]!.details).toMatchObject({ method: 'otp' })

    const rowAfter = await getOtpRow(admin.id)
    expect(rowAfter).toBeNull()

    expect(testSession.get('pendingOtpUser')).toBeUndefined()
    expect(testSession.get('otpFailCount')).toBeUndefined()
  })

  it('OTP is stored as salted hash, not plaintext', async () => {
    const admin = await seedAdminUser()
    const otpCode = await doLogin()

    const row = await getOtpRow(admin.id)
    expect(row).not.toBeNull()

    expect(row!.value).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/)

    expect(row!.value).not.toContain(otpCode)
  })

  it('wrong OTP code is rejected and fail count increments', async () => {
    const admin = await seedAdminUser()
    await doLogin()

    const result = await callAction('verifyotp', otpFormData('000000'))
    expect(result.data?.error).toBe('验证码无效或已过期。')

    expect(testSession.get('otpFailCount')).toBe(1)
    expect(markSessionDirty).toHaveBeenCalled()
    expect(getSetCookie(result)).toBeNull()

    const row = await getOtpRow(admin.id)
    expect(row).not.toBeNull()
  })

  it('lockout after 3 failed OTP attempts', async () => {
    await seedAdminUser()
    await doLogin()

    for (let i = 0; i < 3; i++) {
      await callAction('verifyotp', otpFormData('000000'))
    }

    expect(testSession.get('pendingOtpUser')).toBeUndefined()
    expect(testSession.get('otpFailCount')).toBeUndefined()

    expect(markSessionDirty).toHaveBeenCalled()

    const failures = await auditRowsFor('otp_failed')
    const lockout = failures.find((row) => (row.details as Record<string, unknown> | null)?.lockedOut === true)
    expect(lockout).toBeDefined()
    expect((lockout!.details as Record<string, unknown>).failCount).toBe(3)
  })

  it('wrong password records a credential_login_failed audit event without the password', async () => {
    await seedAdminUser()

    const wrongPassword = 'wrong-password-123'
    const result = await callAction(null, loginFormData('admin@example.com', wrongPassword))
    expect(result.status).toBe(302)
    expect(result.headers.get('Location')).toContain('error=invalid_credentials')

    expect(markSessionDirty).not.toHaveBeenCalled()
    expect(result.headers.get('Set-Cookie')).toBeNull()

    const fails = await auditRowsFor('credential_login_failed')
    expect(fails).toHaveLength(1)
    const row = fails[0]!
    expect(row.resourceType).toBe('user')
    expect(row.resourceId).toBeNull()
    const details = row.details as Record<string, unknown>
    expect(details.reason).toBe('invalid_credentials')

    expect(JSON.stringify(details)).toContain('admin@example.com')
    expect(details).not.toHaveProperty('password')
    expect(JSON.stringify(details)).not.toContain(wrongPassword)
  })

  it('resend issues new OTP and invalidates old one', async () => {
    const admin = await seedAdminUser()
    const oldOtp = await doLogin()

    const resendResult = await callAction('resendotp', withCsrf())
    expect(resendResult.data?.message).toBe('验证码已重新发送。')
    expect(markSessionDirty).toHaveBeenCalled()
    expect(getSetCookie(resendResult)).toBeNull()

    const newOtp = await extractOtpFromMail()
    expect(newOtp).not.toBe(oldOtp)

    const oldResult = await callAction('verifyotp', otpFormData(oldOtp))
    expect(oldResult.data?.error).toBe('验证码无效或已过期。')

    const newResult = await callAction('verifyotp', otpFormData(newOtp))
    expect(newResult.status).toBe(302)
    expect(newResult.headers.get('Set-Cookie')).toMatch(/^__session=/)
    expect(await sessionRowsFor(admin.id)).toHaveLength(1)
    const logins = await auditRowsFor('login')
    expect(logins).toHaveLength(1)
    expect(logins[0]!.details).toMatchObject({ method: 'otp' })
  })

  it('expired OTP is rejected and cleaned up', async () => {
    const admin = await seedAdminUser()
    const otpCode = await doLogin()

    await db
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(and(eq(verification.purpose, 'signin-otp'), eq(verification.userId, admin.id)))

    const result = await callAction('verifyotp', otpFormData(otpCode))
    expect(result.data?.error).toBe('验证码无效或已过期。')
    expect(markSessionDirty).toHaveBeenCalled()
    expect(getSetCookie(result)).toBeNull()

    const row = await getOtpRow(admin.id)
    expect(row).toBeNull()
  })

  it('rate limiting blocks after 3 OTP sends', async () => {
    await seedAdminUser()

    const uniqueIp = '127.0.0.99'

    for (let i = 0; i < 3; i++) {
      await callAction(null, loginFormData(), '/admin', uniqueIp)
      testSession.unset('pendingOtpUser')
      testSession.unset('otpFailCount')
    }

    // Three sends really happened (three mails at the capture server).
    for (let i = 0; i < 3; i++) {
      expect((await parseMail(mail)).to).toContain('admin@example.com')
    }

    markSessionDirty.mockClear()
    const result = await callAction(null, loginFormData(), '/admin', uniqueIp)
    expect(result.data?.error).toBe('发送过于频繁，请稍后再试。')
    expect(markSessionDirty).not.toHaveBeenCalled()
    expect(getSetCookie(result)).toBeNull()
  })

  it('serves OTP errors and the resend acknowledgment as translated descriptors', async () => {
    await seedAdminUser()
    await doLogin()

    const wrong = await callAction('verifyotp', otpFormData('000000'))
    expect(wrong.data?.error).toBe('验证码无效或已过期。')
    expect(wrong.data?.errorDescriptor).toMatchObject({
      messageKey: 'auth.otp.error.invalid',
      fallbackMessage: 'The verification code is invalid or has expired.',
    })

    const wrongEn = await callAction('verifyotp', otpFormData('000000'), '/admin', '127.0.0.1', 'en-US')
    expect(wrongEn.data?.error).toBe('The verification code is invalid or has expired.')

    const resent = await callAction('resendotp', withCsrf())
    expect(resent.data?.message).toBe('验证码已重新发送。')
    expect(resent.data?.messageDescriptor).toMatchObject({
      messageKey: 'auth.otp.success.resent',
      fallbackMessage: 'A new verification code has been sent.',
    })

    const resentEn = await callAction('resendotp', withCsrf(), '/admin', '127.0.0.1', 'en-US')
    expect(resentEn.data?.message).toBe('A new verification code has been sent.')
  })

  it('cancel clears session state', async () => {
    await seedAdminUser()
    await doLogin()

    expect(testSession.get('pendingOtpUser')).toBeDefined()
    expect(testSession.get('otpFailCount')).toBe(0)

    const result = await callAction('cancelotp', withCsrf())
    expect(result.status).toBe(302)
    expect(result.headers.get('Location')).toContain('/admin/signin')
    expect(markSessionDirty).toHaveBeenCalled()
    expect(result.headers.get('Set-Cookie')).toBeNull()

    expect(testSession.get('pendingOtpUser')).toBeUndefined()
    expect(testSession.get('otpFailCount')).toBeUndefined()
  })
})
