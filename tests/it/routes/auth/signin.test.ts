import type { Mock } from 'vitest'

import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeRequestContext } from '#/_helpers/request-context'
import { adminUser, makeSession } from '#/_helpers/session'
import { issueSignInLinkToken } from '@/server/domains/auth/verification-tokens'
import { user, verification } from '@/server/infra/db/schema/user'
import { __resetRateLimitsForTests } from '@/server/infra/rate-limit'

// routes/auth/signin against the real engine: users are real rows with
// real bcrypt passwords, OTP / magic-link / reset tokens are real
// single-use rows in `verification`, and the rate limiter is the real
// in-process one (tripped via settings-bucket overrides). The kept
// mocks follow the established signin-route pattern (signin-otp /
// signin-magiclink): the request-context seam, the install gate, CSRF,
// email DELIVERY (a true external), the session-establish seam, and
// the audit sink.

// ── Mock handles ────────────────────────────────────────────────────────────

const mockHandles = vi.hoisted(() => ({
  getRequestContext: vi.fn<any>(),
  sendSignInOtp: vi.fn<any>(),
  sendSignInLink: vi.fn<any>(),
  sendPasswordReset: vi.fn<any>(),
  establishLoginSession: vi.fn<any>(),
  recordAuditEvent: vi.fn<any>(),
}))

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@/server/http/request-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/http/request-context')>()
  return {
    ...actual,
    getRequestContext: mockHandles.getRequestContext,
  }
})

vi.mock('@/server/domains/settings/install-gate', () => ({
  ensureInstalledOrRedirect: vi.fn(async () => null),
  ensureNoAdminOrRedirect: vi.fn(async () => null),
  isInstalled: vi.fn(async () => true),
  getInstallState: vi.fn(async () => 'installed' as const),
}))

vi.mock('@/server/domains/auth/csrf', () => ({
  validateCsrfForAction: vi.fn(() => true),
}))

vi.mock('@/server/infra/email/sender', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/email/sender')>()
  return {
    ...actual,
    sendSignInOtp: mockHandles.sendSignInOtp,
    sendSignInLink: mockHandles.sendSignInLink,
    sendPasswordReset: mockHandles.sendPasswordReset,
  }
})

vi.mock('@/server/domains/auth/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/domains/auth/primitives')>()
  return {
    ...actual,
    establishLoginSession: mockHandles.establishLoginSession,
  }
})

vi.mock('@/server/domains/audit/services/record', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/domains/audit/services/record')>()
  return {
    ...actual,
    recordAuditEvent: mockHandles.recordAuditEvent,
  }
})

// ── Real infrastructure ─────────────────────────────────────────────────────

const db = getTestDb()

// ── Settings bundles ────────────────────────────────────────────────────────

// Mail transport ready + roomy rate buckets (OTP now follows mail).
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

// ── Import route under test ─────────────────────────────────────────────────

const { action, loader } = await import('@/routes/auth/signin')

// ── Test setup ──────────────────────────────────────────────────────────────

let testSession: BlogSession
let markSessionDirty: Mock<() => void>

beforeAll(() => {
  mockHandles.sendSignInOtp.mockResolvedValue({ ok: true })
  mockHandles.sendSignInLink.mockResolvedValue({ ok: true })
  mockHandles.sendPasswordReset.mockResolvedValue({ ok: true })
  mockHandles.establishLoginSession.mockResolvedValue({
    sid: 'test-sid',
    setCookie: '__session=test-cookie; Path=/',
  })
})

beforeEach(async () => {
  await clearAllTables(db)
  // The rate limiter is a process-level Map — reset it or earlier tests
  // (same email/IP) exhaust the budgets for later ones.
  __resetRateLimitsForTests()
  testSession = makeSession({})
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
  mockHandles.establishLoginSession.mockClear()
  mockHandles.recordAuditEvent.mockClear()
  mockHandles.sendSignInOtp.mockResolvedValue({ ok: true })
  mockHandles.sendSignInLink.mockResolvedValue({ ok: true })
  mockHandles.sendPasswordReset.mockResolvedValue({ ok: true })
  mockHandles.establishLoginSession.mockResolvedValue({
    sid: 'test-sid',
    setCookie: '__session=test-cookie; Path=/',
  })
})

// ── Helpers ─────────────────────────────────────────────────────────────────

const TEST_PASSWORD = 'correcthorsebatterystaple'

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

function loginFormData(email = 'admin@example.com', password = TEST_PASSWORD) {
  const fd = new FormData()
  fd.set('email', email)
  fd.set('password', password)
  return fd
}

function otpFormData(code: string) {
  const fd = new FormData()
  fd.set('otp_code', code)
  return fd
}

function emailFormData(email: string) {
  const fd = new FormData()
  fd.set('email', email)
  return fd
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

/** A 6-digit OTP guaranteed different from `code`. */
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

// ── Tests ───────────────────────────────────────────────────────────────────

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
    const result = await callAction(null, new FormData(), 'https://evil.example/phish')

    expect(extractData(result).redirectTo).toBe('/admin')
  })

  it('falls back to the login view for POST-only action names', async () => {
    // The router navigates to the submitted form's action URL, so the
    // loader revalidates against e.g. `?action=identify` right after the
    // identify round-trip. Those names are POST handlers, not views —
    // resolving them as views would unmount the login form on commit.
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
    // Expiry cleanup marks the session dirty; the redirect carries no
    // Set-Cookie — the middleware commits after the response resolves.
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
    await seedUser()

    const result = await callAction(null, loginFormData())

    expect(mockHandles.sendSignInOtp).not.toHaveBeenCalled()
    expect(mockHandles.establishLoginSession).toHaveBeenCalled()
    // Sid rotation keeps its explicit Set-Cookie channel.
    expect(getSetCookie(result)).toBe('__session=test-cookie; Path=/')
    expect(markSessionDirty).not.toHaveBeenCalled()
    // No OTP row was ever written.
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

    expect(mockHandles.establishLoginSession).toHaveBeenCalledWith(
      db,
      testSession,
      expect.objectContaining({ id: admin.id }),
      expect.any(Request),
      '127.0.0.1',
      expect.objectContaining({ authMethod: 'otp' }),
    )

    // pendingOtpUser should be cleaned up
    expect(testSession.get('pendingOtpUser')).toBeUndefined()
    // Cleanup marks dirty; the sid rotation still carries its own cookie.
    expect(markSessionDirty).toHaveBeenCalled()
    expect(getSetCookie(result)).toBe('__session=test-cookie; Path=/')
    // Single-use: the OTP row is gone.
    expect(await getOtpRow(admin.id)).toBeNull()
  })

  it('fails verification with wrong OTP code', async () => {
    const admin = await seedUser()
    const otpCode = await doLogin()
    markSessionDirty.mockClear()

    const result = await callAction('verifyotp', otpFormData(wrongOtp(otpCode)))

    // otpFailCount should increment
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

    // pendingOtpUser should be cleared (locked out)
    expect(testSession.get('pendingOtpUser')).toBeUndefined()
    expect(markSessionDirty).toHaveBeenCalled()
  })

  it('resends OTP and resets fail count', async () => {
    await seedUser()
    const oldCode = await doLogin()
    testSession.set('otpFailCount', 2)
    markSessionDirty.mockClear()

    const result = await callAction('resendotp', new FormData())

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

    const result = await callAction('cancelotp', new FormData())

    expect(testSession.get('pendingOtpUser')).toBeUndefined()
    expect(testSession.get('otpFailCount')).toBeUndefined()
    expect(markSessionDirty).toHaveBeenCalled()
    expect(getSetCookie(result)).toBeNull()
  })

  it('blocks OTP verify when rate limit is exceeded', async () => {
    setBlogSettingsBundleForTests(withBucket(MAIL_READY_BUNDLE, 'otpVerifyIp', 2))
    await seedUser()
    const otpCode = await doLogin()

    // Two wrong attempts consume the verify budget (failCount 1 and 2 —
    // below the lockout threshold).
    await callAction('verifyotp', otpFormData(wrongOtp(otpCode)))
    await callAction('verifyotp', otpFormData(wrongOtp(otpCode)))
    markSessionDirty.mockClear()

    // The third attempt — even with the CORRECT code — is throttled
    // before the token check runs.
    await callAction('verifyotp', otpFormData(otpCode))

    expect(mockHandles.establishLoginSession).not.toHaveBeenCalled()
    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  // ── Login edge cases ─────────────────────────────────────────────────────

  it('rejects invalid email/password (schema validation)', async () => {
    const result = await callAction(null, loginFormData('not-an-email', ''))

    expect(extractData(result).error).toBe('请填写正确的邮箱和密码。')
    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  it('blocks login when login rate limit exceeded', async () => {
    setBlogSettingsBundleForTests(withBucket(MAIL_READY_BUNDLE, 'signInIp', 1))
    await seedUser()

    // First attempt consumes the single-slot budget (and stages an OTP,
    // hence the dirty mark — cleared before the throttled attempt).
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
    // Send failed before staging: no mutation, not dirty.
    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  // ── verifyotp edge cases ─────────────────────────────────────────────────

  it('rejects verifyotp when no pendingOtpUser in session', async () => {
    const result = await callAction('verifyotp', otpFormData('123456'))

    expect(extractData(result).error).toBe('请先完成登录。')
    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  it('returns error when OTP valid but user not found', async () => {
    const admin = await seedUser()
    const otpCode = await doLogin()
    // Hard-delete the user: `verification` carries no FK, so the OTP row
    // survives and verifies — the user lookup then misses.
    await db.delete(user).where(eq(user.id, admin.id))
    markSessionDirty.mockClear()

    const result = await callAction('verifyotp', otpFormData(otpCode))

    expect(extractData(result).error).toBe('账户状态异常，无法登录。')
    // The pending entry was cleared before the user lookup failed.
    expect(markSessionDirty).toHaveBeenCalled()
    expect(getSetCookie(result)).toBeNull()
    expect(mockHandles.establishLoginSession).not.toHaveBeenCalled()
  })

  it('cleans up otpFailCount on successful verification', async () => {
    await seedUser()
    const otpCode = await doLogin()
    testSession.set('otpFailCount', 2)

    const result = await callAction('verifyotp', otpFormData(otpCode))

    expect(testSession.get('otpFailCount')).toBeUndefined()
    expect(markSessionDirty).toHaveBeenCalled()
    expect(getSetCookie(result)).toBe('__session=test-cookie; Path=/')
  })

  // ── resendotp edge cases ─────────────────────────────────────────────────

  it('rejects resend when no pendingOtpUser in session', async () => {
    const result = await callAction('resendotp', new FormData())

    expect(extractData(result).error).toBe('请先完成登录。')
    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  it('returns error when email send fails on resend', async () => {
    await seedUser()
    await doLogin()
    mockHandles.sendSignInOtp.mockResolvedValueOnce({ ok: false, reason: 'upstream', status: 500, message: 'fail' })
    markSessionDirty.mockClear()

    const result = await callAction('resendotp', new FormData())

    expect(extractData(result).error).toBe('验证码发送失败，请稍后重试。')
    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  it('updates pendingOtpUser with new expiresAt and sentAt on resend', async () => {
    const admin = await seedUser()
    await doLogin()
    const oldExpires = Date.now() + 60 * 1000
    const oldSent = Date.now() - 4 * 60 * 1000
    stagePendingOtp(admin.id, { expiresAt: oldExpires, sentAt: oldSent })

    await callAction('resendotp', new FormData())

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

    const result = await callAction('resendotp', new FormData())

    expect(extractData(result).error).toBe('发送过于频繁，请稍后再试。')
    expect(mockHandles.sendSignInOtp).toHaveBeenCalledTimes(1)
    expect(markSessionDirty).not.toHaveBeenCalled()
  })

  // ── cancelotp edge cases ─────────────────────────────────────────────────

  it('preserves redirectTo in cancel redirect', async () => {
    await seedUser()
    await doLogin()

    const result = await callAction('cancelotp', new FormData(), '/admin/posts')

    expect(result.status).toBe(302)
    expect(result.headers.get('location')).toContain(encodeURIComponent('/admin/posts'))
  })
})

describe('routes/signin — identify (real db)', () => {
  it('rejects malformed email', async () => {
    const result = await callAction('identify', emailFormData('not-an-email'))
    expect(extractData(result).error).toBe('请填写正确的邮箱地址。')
  })

  it('returns method=password for unknown email without leaking existence', async () => {
    const result = await callAction('identify', emailFormData('ghost@example.com'))
    expect(extractData(result).method).toBe('password')

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
    const result = await callAction('magiclink', fd)
    expect(extractData(result).error).toBe('链接无效或已过期，请重新获取。')

    expect(mockHandles.establishLoginSession).not.toHaveBeenCalled()
  })

  it('establishes a session for a valid token', async () => {
    const admin = await seedUser({ loginMethod: 'magic-link' })
    const { token } = issueSignInLinkToken(db, admin.id)

    const fd = new FormData()
    fd.set('magic_token', token)
    const result = await callAction('magiclink', fd)

    expect(mockHandles.establishLoginSession).toHaveBeenCalledWith(
      db,
      testSession,
      expect.objectContaining({ id: admin.id }),
      expect.any(Request),
      '127.0.0.1',
      expect.objectContaining({ authMethod: 'magic-link' }),
    )
    expect(result.status).toBe(302)
    expect(getSetCookie(result)).toBe('__session=test-cookie; Path=/')

    // Single-use: a replay with the same token fails.
    const replay = await callAction('magiclink', fd)
    expect(extractData(replay).error).toBe('链接无效或已过期，请重新获取。')
  })
})
