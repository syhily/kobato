import type { Mock } from 'vitest'

import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeRequestContext } from '#/_helpers/request-context'
import { makeSession } from '#/_helpers/session'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { auditLog } from '@/server/infra/db/schema/config'
import { session as sessionTable } from '@/server/infra/db/schema/session'
import { user, verification } from '@/server/infra/db/schema/user'
import { __resetRateLimitsForTests } from '@/server/infra/rate-limit'

// ── Mock handles ────────────────────────────────────────────────────────────
//
// Everything runs REAL except the two sanctioned doubles: the
// request-context seam and email DELIVERY (a true external that doubles
// as the plaintext OTP extraction channel / failure-path inducer). The
// install gate reads the real `user` table (a gate admin is seeded per
// test), CSRF is the real session-token check, establishLoginSession runs
// for real (asserted via the session table + the real Set-Cookie), and
// audit events land in `audit_log` through the real batcher (asserted
// after a flush).

const mockHandles = vi.hoisted(() => ({
  getRequestContext: vi.fn<any>(),
  sendSignInOtp: vi.fn<any>(),
}))

// ── Module mocks ────────────────────────────────────────────────────────────

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
  }
})

// ── Real infrastructure ─────────────────────────────────────────────────────

const db = getTestDb()

const CSRF_TOKEN = 'signin-otp-csrf-token'

// ── Settings bundle with a ready mail transport (OTP now follows mail) ──────

const OTP_TEST_BUNDLE = {
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
    otpSendIp: { windowSeconds: 60, maxAttempts: 3 },
    otpSendEmail: { windowSeconds: 60, maxAttempts: 10 },
    otpVerifyIp: { windowSeconds: 60, maxAttempts: 10 },
    otpVerifyEmail: { windowSeconds: 60, maxAttempts: 10 },
  },
} as BlogSettingsBundle

// ── Import route under test ─────────────────────────────────────────────────

const { action } = await import('@/routes/auth/signin')

// ── Test setup ──────────────────────────────────────────────────────────────

let testSession: BlogSession
let markSessionDirty: Mock<() => void>

beforeEach(async () => {
  // The real audit pipeline: recordAuditEvent pushes into the
  // process-level batcher; flush before teardown so no pending event
  // references a user row the next clearAllTables will wipe (FK).
  initAllBatchers(getDatabaseHandle())
  setBlogSettingsBundleForTests(OTP_TEST_BUNDLE)
  await clearAllTables(db)
  // The real install gate needs an installed deployment: seed one admin.
  await seedGateAdmin()
  // The rate limiter is a process-level Map — reset it or earlier tests
  // (same email/IP) exhaust the otpSend* budgets for later ones.
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
  mockHandles.sendSignInOtp.mockResolvedValue({ ok: true })
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
})

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function setContext(action: string | null, redirectTo = '/admin', clientAddress = '127.0.0.1') {
  const params = new URLSearchParams()
  if (action) {
    params.set('action', action)
  }
  params.set('redirect_to', redirectTo)
  const url = new URL(`http://localhost/admin/signin?${params.toString()}`)
  mockHandles.getRequestContext.mockReturnValue(
    makeRequestContext({ session: testSession, clientAddress, db, request: new Request(url), markSessionDirty }),
  )
  return url
}

async function callAction(
  actionName: string | null,
  formData: FormData,
  redirectTo = '/admin',
  clientAddress = '127.0.0.1',
): Promise<Response & { data?: any }> {
  const url = setContext(actionName, redirectTo, clientAddress)
  const request = new Request('http://localhost/admin/signin', {
    method: 'POST',
    body: formData,
  })
  try {
    return (await action({
      request,
      url,
      context: new Map(),
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

// `redirect()` results are real Responses; `data()` results keep their
// headers under `.init` (React Router's DataWithResponseInit).
function getSetCookie(result: Response & { data?: any }): string | null {
  if (result.headers instanceof Headers) {
    return result.headers.get('Set-Cookie')
  }
  const init = (result as { init?: { headers?: Record<string, string> } }).init
  return init?.headers?.['Set-Cookie'] ?? null
}

async function doLogin(): Promise<string> {
  await callAction(null, loginFormData())
  expect(mockHandles.sendSignInOtp).toHaveBeenCalled()
  return mockHandles.sendSignInOtp.mock.calls[0]![1] as string
}

async function getOtpRow(userId: number) {
  const rows = await db
    .select()
    .from(verification)
    .where(and(eq(verification.purpose, 'signin-otp'), eq(verification.userId, userId)))
  return rows[0] ?? null
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

// ── Tests ───────────────────────────────────────────────────────────────────

describe('integration: OTP login flow (real DB)', () => {
  it('full happy path: login → OTP → verify → session established', async () => {
    const admin = await seedAdminUser()

    // Step 1: Login triggers OTP — same-session staging marks the session
    // dirty; the redirect carries no Set-Cookie (the boundary middleware
    // commits the session after the response resolves).
    const loginResult = await callAction(null, loginFormData())
    expect(mockHandles.sendSignInOtp).toHaveBeenCalledTimes(1)
    const otpCode = mockHandles.sendSignInOtp.mock.calls[0]![1] as string
    expect(markSessionDirty).toHaveBeenCalled()
    expect(loginResult.headers.get('Set-Cookie')).toBeNull()
    markSessionDirty.mockClear()
    expect(mockHandles.sendSignInOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'admin@example.com' }),
      otpCode,
    )

    // Verification row exists in DB
    const row = await getOtpRow(admin.id)
    expect(row).not.toBeNull()
    expect(row!.purpose).toBe('signin-otp')

    // Session has pending OTP state
    expect(testSession.get('pendingOtpUser')).toEqual(
      expect.objectContaining({
        userId: String(admin.id),
        email: 'admin@example.com',
      }),
    )
    expect(testSession.get('otpFailCount')).toBe(0)

    // Step 2: Verify OTP
    const result = await callAction('verifyotp', otpFormData(otpCode))

    expect(result.status).toBe(302)
    expect(result.headers.get('Location')).toBe('/admin')
    // sid rotation keeps the explicit Set-Cookie channel — a REAL cookie
    // minted by the real establishLoginSession.
    expect(result.headers.get('Set-Cookie')).toMatch(/^__session=/)

    // The real establish wrote a session row owned by the admin.
    const sessions = await sessionRowsFor(admin.id)
    expect(sessions).toHaveLength(1)
    expect(sessions[0]!.loginAt).not.toBeNull()

    // …and recorded the login audit with the OTP method.
    const logins = await auditRowsFor('login')
    expect(logins).toHaveLength(1)
    expect(logins[0]!.resourceType).toBe('session')
    expect(logins[0]!.resourceId).toBe(sessions[0]!.id)
    expect(logins[0]!.actorId).toBe(admin.id)
    expect(logins[0]!.details).toMatchObject({ method: 'otp' })

    // OTP row deleted (single-use)
    const rowAfter = await getOtpRow(admin.id)
    expect(rowAfter).toBeNull()

    // Session cleaned
    expect(testSession.get('pendingOtpUser')).toBeUndefined()
    expect(testSession.get('otpFailCount')).toBeUndefined()
  })

  it('OTP is stored as salted hash, not plaintext', async () => {
    const admin = await seedAdminUser()
    const otpCode = await doLogin()

    const row = await getOtpRow(admin.id)
    expect(row).not.toBeNull()

    // Value is salt:hash format (32-hex salt : 64-hex sha256)
    expect(row!.value).toMatch(/^[0-9a-f]{32}:[0-9a-f]{64}$/)

    // Raw OTP code is NOT stored in the value column
    expect(row!.value).not.toContain(otpCode)
  })

  it('wrong OTP code is rejected and fail count increments', async () => {
    const admin = await seedAdminUser()
    await doLogin()

    const result = await callAction('verifyotp', otpFormData('000000'))
    expect(result.data?.error).toBe('验证码无效或已过期。')

    // Fail count incremented — a same-session mutation: the session is
    // marked dirty and the data result carries no Set-Cookie.
    expect(testSession.get('otpFailCount')).toBe(1)
    expect(markSessionDirty).toHaveBeenCalled()
    expect(getSetCookie(result)).toBeNull()

    // Verification row still exists (not consumed)
    const row = await getOtpRow(admin.id)
    expect(row).not.toBeNull()
  })

  it('lockout after 3 failed OTP attempts', async () => {
    await seedAdminUser()
    await doLogin()

    // Fail 3 times
    for (let i = 0; i < 3; i++) {
      await callAction('verifyotp', otpFormData('000000'))
    }

    // Pending state cleared
    expect(testSession.get('pendingOtpUser')).toBeUndefined()
    expect(testSession.get('otpFailCount')).toBeUndefined()
    // Each failed attempt mutates the fail counter — the session was
    // marked dirty along the way.
    expect(markSessionDirty).toHaveBeenCalled()

    // The lockout audit event really landed in audit_log.
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
    // Invalid credentials mutate nothing — neither a dirty mark nor a
    // Set-Cookie header on the redirect.
    expect(markSessionDirty).not.toHaveBeenCalled()
    expect(result.headers.get('Set-Cookie')).toBeNull()

    // Failed credential logins are audited; the password must never appear.
    const fails = await auditRowsFor('credential_login_failed')
    expect(fails).toHaveLength(1)
    const row = fails[0]!
    expect(row.resourceType).toBe('user')
    expect(row.resourceId).toBeNull()
    const details = row.details as Record<string, unknown>
    expect(details.reason).toBe('invalid_credentials')
    // The email lands L3-tagged ({E}…{/E}) but present.
    expect(JSON.stringify(details)).toContain('admin@example.com')
    expect(details).not.toHaveProperty('password')
    expect(JSON.stringify(details)).not.toContain(wrongPassword)
  })

  it('resend issues new OTP and invalidates old one', async () => {
    const admin = await seedAdminUser()
    const oldOtp = await doLogin()

    // Resend — re-staging is a same-session mutation: the session is
    // marked dirty and the data result carries no Set-Cookie.
    const resendResult = await callAction('resendotp', withCsrf())
    expect(resendResult.data?.message).toBe('验证码已重新发送。')
    expect(markSessionDirty).toHaveBeenCalled()
    expect(getSetCookie(resendResult)).toBeNull()

    // New OTP issued
    expect(mockHandles.sendSignInOtp).toHaveBeenCalledTimes(2)
    const newOtp = mockHandles.sendSignInOtp.mock.calls[1]![1] as string
    expect(newOtp).not.toBe(oldOtp)

    // Old OTP code rejected
    const oldResult = await callAction('verifyotp', otpFormData(oldOtp))
    expect(oldResult.data?.error).toBe('验证码无效或已过期。')

    // New OTP code accepted — the real establish rotates the sid and
    // writes the admin's session row.
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

    // Manually expire the OTP row in DB
    await db
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(and(eq(verification.purpose, 'signin-otp'), eq(verification.userId, admin.id)))

    // Correct code but expired token — the fail counter still increments,
    // so the session is marked dirty; the data result carries no Set-Cookie.
    const result = await callAction('verifyotp', otpFormData(otpCode))
    expect(result.data?.error).toBe('验证码无效或已过期。')
    expect(markSessionDirty).toHaveBeenCalled()
    expect(getSetCookie(result)).toBeNull()

    // Expired row cleaned up by verifyOtpToken
    const row = await getOtpRow(admin.id)
    expect(row).toBeNull()
  })

  it('rate limiting blocks after 3 OTP sends', async () => {
    await seedAdminUser()

    // Use a unique IP so parallel tests don't share the same rate-limit bucket.
    const uniqueIp = '127.0.0.99'

    // Send OTP 3 times (maxAttempts=3 for otpSendIp)
    for (let i = 0; i < 3; i++) {
      await callAction(null, loginFormData(), '/admin', uniqueIp)
      testSession.unset('pendingOtpUser')
      testSession.unset('otpFailCount')
    }

    expect(mockHandles.sendSignInOtp).toHaveBeenCalledTimes(3)

    // 4th attempt blocked by rate limit — throttled before any staging, so
    // no session mutation: neither a dirty mark nor a Set-Cookie header.
    markSessionDirty.mockClear()
    const result = await callAction(null, loginFormData(), '/admin', uniqueIp)
    expect(result.data?.error).toBe('发送过于频繁，请稍后再试。')
    expect(markSessionDirty).not.toHaveBeenCalled()
    expect(getSetCookie(result)).toBeNull()
  })

  it('cancel clears session state', async () => {
    await seedAdminUser()
    await doLogin()

    expect(testSession.get('pendingOtpUser')).toBeDefined()
    expect(testSession.get('otpFailCount')).toBe(0)

    const result = await callAction('cancelotp', withCsrf())
    expect(result.status).toBe(302)
    expect(result.headers.get('Location')).toContain('/admin/signin')
    // Clearing the pending state is a same-session mutation — the domain
    // only marks the session dirty; the redirect carries no Set-Cookie.
    expect(markSessionDirty).toHaveBeenCalled()
    expect(result.headers.get('Set-Cookie')).toBeNull()

    // Session clean
    expect(testSession.get('pendingOtpUser')).toBeUndefined()
    expect(testSession.get('otpFailCount')).toBeUndefined()
  })
})
