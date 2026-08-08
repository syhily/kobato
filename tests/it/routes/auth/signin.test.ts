import type { Mock } from 'vitest'

import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeRequestContext } from '#/_helpers/request-context'
import { adminUser, makeSession } from '#/_helpers/session'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { issueSignInLinkToken } from '@/server/domains/auth/verification-tokens'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { auditLog } from '@/server/infra/db/schema/config'
import { session as sessionTable } from '@/server/infra/db/schema/session'
import { user, verification } from '@/server/infra/db/schema/user'
import { __resetRateLimitsForTests } from '@/server/infra/rate-limit'

// routes/auth/signin against the real engine; only mocks: the
// request-context seam and email DELIVERY (OTP / magic-link extraction).

const mockHandles = vi.hoisted(() => ({
  getRequestContext: vi.fn<any>(),
  sendSignInOtp: vi.fn<any>(),
  sendSignInLink: vi.fn<any>(),
  sendPasswordReset: vi.fn<any>(),
}))

vi.mock('@/server/http/request-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/http/request-context')>()
  return {
    ...actual,
    getRequestContext: mockHandles.getRequestContext,
  }
})

vi.mock('@/server/infra/email/sender', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/email/sender')>()
  return {
    ...actual,
    sendSignInOtp: mockHandles.sendSignInOtp,
    sendSignInLink: mockHandles.sendSignInLink,
    sendPasswordReset: mockHandles.sendPasswordReset,
  }
})

const db = getTestDb()

const CSRF_TOKEN = 'signin-route-csrf-token'

// Mail transport ready + roomy rate buckets.
const MAIL_READY_BUNDLE = {
  ...TEST_BLOG_SETTINGS_BUNDLE,
  mail: {
    mail: {
      ...TEST_BLOG_SETTINGS_BUNDLE.mail!.mail,
      enabled: true,
      apiKey: 'test-key',
    },
  },
  rateLimit: {
    ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit,
    signInIp: { windowSeconds: 60, maxAttempts: 10 },
    signInEmail: { windowSeconds: 60, maxAttempts: 10 },
    otpSendIp: { windowSeconds: 60, maxAttempts: 10 },
    otpSendEmail: { windowSeconds: 60, maxAttempts: 10 },
    otpVerifyIp: { windowSeconds: 60, maxAttempts: 10 },
    otpVerifyEmail: { windowSeconds: 60, maxAttempts: 10 },
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
  // Flush before teardown so no pending event references a row the next
  // clearAllTables wipes (FK).
  initAllBatchers(getDatabaseHandle())
  await clearAllTables(db)
  // The real install gate needs an installed deployment: seed one admin.
  await seedGateAdmin()
  // The rate limiter is a process-level Map — reset it or earlier tests
  // (same email/IP) exhaust the budgets for later ones.
  __resetRateLimitsForTests()
  testSession = makeSession({})
  testSession.set('csrfToken', CSRF_TOKEN)
  markSessionDirty = vi.fn<() => void>()
  mockHandles.getRequestContext.mockReturnValue(
    makeRequestContext({
      session: testSession,
      db,
      request: new Request('http://localhost/admin/signin'),
      markSessionDirty,
    }),
  )
  mockHandles.sendSignInOtp.mockClear()
  mockHandles.sendSignInLink.mockClear()
  mockHandles.sendPasswordReset.mockClear()
  mockHandles.sendSignInOtp.mockResolvedValue({ ok: true })
  mockHandles.sendSignInLink.mockResolvedValue({ ok: true })
  mockHandles.sendPasswordReset.mockResolvedValue({ ok: true })
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
})

const TEST_PASSWORD = 'correcthorsebatterystaple'

/** Satisfies the real install gate (hasAdmin) without colliding with the
 * per-test `admin@example.com` seeds. */
async function seedGateAdmin() {
  await db.insert(user).values({
    name: 'Gatekeeper',
    email: 'gatekeeper@example.com',
    password: 'not-a-real-hash',
    role: 'admin',
  })
}

async function seedUser(overrides: Record<string, unknown> = {}) {
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
  mockHandles.getRequestContext.mockReturnValue(
    makeRequestContext({ session: testSession, clientAddress, db, request: new Request(url), markSessionDirty }),
  )
  return url
}

async function callAction(
  actionName: string | null,
  formData: FormData,
  redirectTo: string | null = '/admin',
  clientAddress = '127.0.0.1',
): Promise<Response & { data?: any }> {
  const url = setContext(actionName, redirectTo, clientAddress)
  const request = new Request(url, { method: 'POST', body: formData })
  try {
    return (await action({
      request,
      url,
      context: new Map(),
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
  mockHandles.getRequestContext.mockReturnValue(
    makeRequestContext({ session: testSession, db, request: new Request(url), markSessionDirty }),
  )
  try {
    return (await loader({
      request: new Request(url),
      url,
      context: new Map(),
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

// `redirect()` results are real Responses; `data()` results keep their
// headers under `.init` (React Router's DataWithResponseInit).
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

/** Login (password verified, mail ready) and return the emailed OTP code. */
async function doLogin(clientAddress = '127.0.0.1'): Promise<string> {
  await callAction(null, loginFormData(), '/admin', clientAddress)
  expect(mockHandles.sendSignInOtp).toHaveBeenCalled()
  return mockHandles.sendSignInOtp.mock.calls[0]![1] as string
}

function wrongOtp(code: string): string {
  return code === '000000' ? '111111' : '000000'
}

async function getOtpRow(userId: number) {
  const rows = await db
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

/** The session rows the real establishLoginSession wrote for a user. */
async function sessionRowsFor(userId: number) {
  return db.select().from(sessionTable).where(eq(sessionTable.userId, userId))
}

/** Audit rows of one action, flushed first so the batcher has drained. */
async function auditRowsFor(actionName: string) {
  await flushAuditLog()
  return db.select().from(auditLog).where(eq(auditLog.action, actionName))
}

describe('routes/signin', () => {
  it('sanitizes external logout redirect targets', async () => {
    const response = await callLoader('?action=logout&redirect_to=https://evil.example/phish')

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/')
  })

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

  it('falls back to the login view for POST-only action names', async () => {
    // POST-only action names must resolve to the login view, or the form
    // unmounts on commit.
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
    // Expiry cleanup marks dirty; the middleware commits the redirect's Set-Cookie.
    expect(markSessionDirty).toHaveBeenCalledTimes(1)
    expect(response.headers.get('Set-Cookie')).toBeNull()
    expect(testSession.get('pendingOtpUser')).toBeUndefined()
    expect(testSession.get('otpFailCount')).toBeUndefined()
  })
})

describe('routes/signin — OTP (real db + tokens)', () => {
  beforeEach(() => {
    setBlogSettingsBundleForTests(MAIL_READY_BUNDLE)
  })

  it('issues OTP and sends email when mail is ready', async () => {
    const admin = await seedUser()

    const result = await callAction(null, loginFormData())

    expect(mockHandles.sendSignInOtp).toHaveBeenCalledTimes(1)
    const otpCode = mockHandles.sendSignInOtp.mock.calls[0]![1] as string
    expect(mockHandles.sendSignInOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'admin@example.com' }),
      otpCode,
    )
    expect(testSession.get('pendingOtpUser')).toEqual(
      expect.objectContaining({ userId: String(admin.id), email: 'admin@example.com' }),
    )
    expect(testSession.get('otpFailCount')).toBe(0)
    // Staging is a same-session mutation: dirty-marked, no Set-Cookie.
    expect(markSessionDirty).toHaveBeenCalled()
    expect(getSetCookie(result)).toBeNull()
    // The OTP row is real, and never stores the code in plaintext.
    const row = await getOtpRow(admin.id)
    expect(row).not.toBeNull()
    expect(row!.value).not.toContain(otpCode)
  })

  it('does NOT trigger OTP when mail is not ready', async () => {
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    const admin = await seedUser()

    const result = await callAction(null, loginFormData())

    expect(mockHandles.sendSignInOtp).not.toHaveBeenCalled()
    // Real establishLoginSession: sid rotation keeps its explicit Set-Cookie channel.
    expect(getSetCookie(result)).toMatch(/^__session=/)
    expect(await sessionRowsFor(admin.id)).toHaveLength(1)
    expect(markSessionDirty).not.toHaveBeenCalled()
    expect(await db.select().from(verification)).toHaveLength(0)
  })

  it('blocks OTP send when rate limit is exceeded', async () => {
    setBlogSettingsBundleForTests(withBucket(MAIL_READY_BUNDLE, 'otpSendIp', 1))
    await seedUser()

    // First login consumes the single-slot budget and sends.
    await callAction(null, loginFormData())
    expect(mockHandles.sendSignInOtp).toHaveBeenCalledTimes(1)
    testSession.unset('pendingOtpUser')
    testSession.unset('otpFailCount')
    markSessionDirty.mockClear()

    const result = await callAction(null, loginFormData())

    expect(extractData(result).error).toBe('发送过于频繁，请稍后再试。')
    expect(mockHandles.sendSignInOtp).toHaveBeenCalledTimes(1)
    // Rate-limit error carries no mutation: not dirty, no Set-Cookie.
    expect(markSessionDirty).not.toHaveBeenCalled()
    expect(getSetCookie(result)).toBeNull()
  })

  it('verifies OTP successfully and establishes session', async () => {
    const admin = await seedUser()
    const otpCode = await doLogin()

    const result = await callAction('verifyotp', otpFormData(otpCode))

    // Real establishLoginSession: session row + Set-Cookie + audit stamped method=otp.
    const sessions = await sessionRowsFor(admin.id)
    expect(sessions).toHaveLength(1)
    expect(getSetCookie(result)).toMatch(/^__session=/)
    const logins = await auditRowsFor('login')
    expect(logins).toHaveLength(1)
    expect(logins[0]!.resourceId).toBe(sessions[0]!.id)
    expect(logins[0]!.actorId).toBe(admin.id)
    expect(logins[0]!.details).toMatchObject({ method: 'otp' })

    expect(testSession.get('pendingOtpUser')).toBeUndefined()
    // Cleanup marks dirty; the sid rotation still carries its own cookie.
    expect(markSessionDirty).toHaveBeenCalled()
    // Single-use: the OTP row is gone.
    expect(await getOtpRow(admin.id)).toBeNull()
  })

  it('fails verification with wrong OTP code', async () => {
    const admin = await seedUser()
    const otpCode = await doLogin()
    markSessionDirty.mockClear()

    const result = await callAction('verifyotp', otpFormData(wrongOtp(otpCode)))

    expect(testSession.get('otpFailCount')).toBe(1)
    // Fail-counter mutation marks dirty; the error carries no Set-Cookie.
    expect(markSessionDirty).toHaveBeenCalled()
    expect(getSetCookie(result)).toBeNull()
    // The OTP row survives a failed attempt.
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

    // The lockout audit event really landed.
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

    expect(mockHandles.sendSignInOtp).toHaveBeenCalledTimes(2)
    const newCode = mockHandles.sendSignInOtp.mock.calls[1]![1] as string
    expect(newCode).not.toBe(oldCode)
    expect(testSession.get('otpFailCount')).toBe(0)
    // Resend re-stages the pending entry: dirty-marked, no Set-Cookie.
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
    setBlogSettingsBundleForTests(withBucket(MAIL_READY_BUNDLE, 'otpVerifyIp', 2))
    const admin = await seedUser()
    const otpCode = await doLogin()

    // Two wrong attempts consume the verify budget (below the lockout threshold).
    await callAction('verifyotp', otpFormData(wrongOtp(otpCode)))
    await callAction('verifyotp', otpFormData(wrongOtp(otpCode)))
    markSessionDirty.mockClear()

    // The third attempt is throttled before the token check — even with the correct code.
    await callAction('verifyotp', otpFormData(otpCode))

    // Throttled before establish.
    expect(await sessionRowsFor(admin.id)).toHaveLength(0)
    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  it('rejects invalid email/password (schema validation)', async () => {
    const result = await callAction(null, loginFormData('not-an-email', ''))

    expect(extractData(result).error).toBe('请填写正确的邮箱和密码。')
    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  it('blocks login when login rate limit exceeded', async () => {
    setBlogSettingsBundleForTests(withBucket(MAIL_READY_BUNDLE, 'signInIp', 1))
    await seedUser()

    // First attempt consumes the single-slot budget (dirty mark cleared first).
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
    // Invalid-credentials redirect carries no mutation: no Set-Cookie.
    expect(getSetCookie(result)).toBeNull()
    expect(markSessionDirty).not.toHaveBeenCalled()
    expect(mockHandles.sendSignInOtp).not.toHaveBeenCalled()
    expect(await db.select().from(verification)).toHaveLength(0)
  })

  it('returns error when first-time OTP email send fails', async () => {
    await seedUser()
    mockHandles.sendSignInOtp.mockResolvedValueOnce({ ok: false, reason: 'upstream', status: 500, message: 'fail' })

    const result = await callAction(null, loginFormData())

    expect(extractData(result).error).toBe('验证码发送失败，请稍后重试。')
    expect(testSession.get('pendingOtpUser')).toBeUndefined()
    // Send failed before staging: no mutation, not dirty.
    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  it('returns error when first-time OTP email throws', async () => {
    await seedUser()
    mockHandles.sendSignInOtp.mockRejectedValueOnce(new Error('network timeout'))

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
    // No FK on verification: the OTP row survives the hard-deleted user.
    await db.delete(user).where(eq(user.id, admin.id))
    markSessionDirty.mockClear()

    const result = await callAction('verifyotp', otpFormData(otpCode))

    expect(extractData(result).error).toBe('账户状态异常，无法登录。')
    // The pending entry was cleared before the user lookup failed.
    expect(markSessionDirty).toHaveBeenCalled()
    expect(getSetCookie(result)).toBeNull()
    expect(await db.select().from(sessionTable)).toHaveLength(0)
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
    mockHandles.sendSignInOtp.mockResolvedValueOnce({ ok: false, reason: 'upstream', status: 500, message: 'fail' })
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
    setBlogSettingsBundleForTests(withBucket(MAIL_READY_BUNDLE, 'otpSendIp', 1))
    await seedUser()
    // The initial login already consumed the single-slot send budget.
    await doLogin()
    markSessionDirty.mockClear()

    const result = await callAction('resendotp', withCsrf())

    expect(extractData(result).error).toBe('发送过于频繁，请稍后再试。')
    expect(mockHandles.sendSignInOtp).toHaveBeenCalledTimes(1)
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
    // Same response shape + generic copy as a real send…
    expect(extractData(result).message).toBe('如果该邮箱已注册，登录链接已发送，请查收邮箱。')

    // …but nothing was actually sent or persisted.
    expect(mockHandles.sendSignInLink).not.toHaveBeenCalled()
    expect(await db.select().from(verification)).toHaveLength(0)
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
    const admin = await seedUser({ loginMethod: 'magic-link' })

    const result = await callAction('identify', emailFormData('admin@example.com'))
    expect(extractData(result).message).toBe('如果该邮箱已注册，登录链接已发送，请查收邮箱。')

    expect(mockHandles.sendSignInLink).toHaveBeenCalledTimes(1)
    const [recipient, link] = mockHandles.sendSignInLink.mock.calls[0]! as [{ email: string }, string]
    expect(recipient.email).toBe('admin@example.com')
    expect(link).toContain('action=magiclink')
    // A real signin-link token row backs the emailed link.
    const rows = await db
      .select()
      .from(verification)
      .where(and(eq(verification.purpose, 'signin-link'), eq(verification.userId, admin.id)))
    expect(rows).toHaveLength(1)
  })

  it('degrades a magic-link user to password when mail is not ready', async () => {
    await seedUser({ loginMethod: 'magic-link' })

    const result = await callAction('identify', emailFormData('admin@example.com'))
    expect(extractData(result).method).toBe('password')

    expect(mockHandles.sendSignInLink).not.toHaveBeenCalled()
    expect(await db.select().from(verification)).toHaveLength(0)
  })

  it('blocks identify when rate limit is exceeded', async () => {
    setBlogSettingsBundleForTests(withBucket(TEST_BLOG_SETTINGS_BUNDLE, 'signInIp', 1))

    // First identify consumes the single-slot budget.
    await callAction('identify', emailFormData('admin@example.com'))

    const result = await callAction('identify', emailFormData('admin@example.com'))
    expect(extractData(result).error).toBe('登录失败次数过多，请稍后再试。')
  })
})

describe('routes/signin — magic-link consume (real db + tokens)', () => {
  it('rejects an invalid or expired token', async () => {
    const fd = new FormData()
    fd.set('magic_token', 'bogus-token')
    const result = await callAction('magiclink', withCsrf(fd))
    expect(extractData(result).error).toBe('链接无效或已过期，请重新获取。')

    expect(await db.select().from(sessionTable)).toHaveLength(0)
  })

  it('establishes a session for a valid token', async () => {
    const admin = await seedUser({ loginMethod: 'magic-link' })
    const { token } = issueSignInLinkToken(db, admin.id)

    const fd = new FormData()
    fd.set('magic_token', token)
    const result = await callAction('magiclink', withCsrf(fd))

    // Real establishLoginSession: session row + Set-Cookie + audit method=magic-link.
    const sessions = await sessionRowsFor(admin.id)
    expect(sessions).toHaveLength(1)
    expect(result.status).toBe(302)
    expect(getSetCookie(result)).toMatch(/^__session=/)
    const logins = await auditRowsFor('login')
    expect(logins).toHaveLength(1)
    expect(logins[0]!.resourceId).toBe(sessions[0]!.id)
    expect(logins[0]!.details).toMatchObject({ method: 'magic-link' })

    // Single-use: a replay with the same token fails.
    const replay = await callAction('magiclink', withCsrf(fd))
    expect(extractData(replay).error).toBe('链接无效或已过期，请重新获取。')
  })
})
