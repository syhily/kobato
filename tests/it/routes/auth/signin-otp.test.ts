import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { clearAllTables } from '#/_helpers/integration-db'
import { flushWorkerRedis } from '#/_helpers/redis'
import { makeSession } from '#/_helpers/session'
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/snapshot'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { user, verification } from '@/server/infra/db/schema/user'

// ── Mock handles ────────────────────────────────────────────────────────────

const mockHandles = vi.hoisted(() => ({
  getDbFromContext: vi.fn<any>(),
  getPoolFromContext: vi.fn<any>(),
  sendSignInOtp: vi.fn<any>(),
  establishLoginSession: vi.fn<any>(),
  getRouteRequestContext: vi.fn<any>(),
  recordAuditEvent: vi.fn<any>(),
}))

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@/server/domains/auth/context', () => ({
  getRouteRequestContext: mockHandles.getRouteRequestContext,
  getDbFromContext: mockHandles.getDbFromContext,
  getPoolFromContext: mockHandles.getPoolFromContext,
}))

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
  }
})

vi.mock('@/server/domains/auth/primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/domains/auth/primitives')>()
  return {
    ...actual,
    establishLoginSession: mockHandles.establishLoginSession,
  }
})

vi.mock('@/server/domains/audit/service', () => ({
  recordAuditEvent: mockHandles.recordAuditEvent,
}))

// ── Real infrastructure ─────────────────────────────────────────────────────

const poolDb = createDbPool()
const db: NodePgDatabase = poolDb.db
const pool: Pool = poolDb.pool

afterAll(async () => {
  await closePool(pool)
})

// ── Settings bundle with OTP enabled ────────────────────────────────────────

const OTP_TEST_BUNDLE = {
  ...TEST_BLOG_SETTINGS_BUNDLE,
  security: {
    ...TEST_BLOG_SETTINGS_BUNDLE.security,
    otp: { enabled: true },
  },
  mail: {
    mail: { enabled: true, host: 'api.zeabur.com', apiKey: 'test-key', sender: 'noreply@example.com' },
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

beforeAll(() => {
  mockHandles.getDbFromContext.mockReturnValue(db)
  mockHandles.getPoolFromContext.mockReturnValue(pool)
  mockHandles.sendSignInOtp.mockResolvedValue({ ok: true })
  mockHandles.establishLoginSession.mockResolvedValue({
    sid: 'test-sid',
    setCookie: '__session=test-cookie; Path=/',
  })
})

beforeEach(async () => {
  setBlogSettingsBundleForTests(OTP_TEST_BUNDLE)
  await clearAllTables(db)
  await flushWorkerRedis()
  testSession = makeSession({})
  mockHandles.getRouteRequestContext.mockReturnValue({
    session: testSession,
    user: undefined,
    role: null,
    clientAddress: '127.0.0.1',
    url: new URL('http://localhost/admin/signin'),
  })
  mockHandles.sendSignInOtp.mockClear()
  mockHandles.establishLoginSession.mockClear()
  mockHandles.recordAuditEvent.mockClear()
  mockHandles.sendSignInOtp.mockResolvedValue({ ok: true })
  mockHandles.establishLoginSession.mockResolvedValue({
    sid: 'test-sid',
    setCookie: '__session=test-cookie; Path=/',
  })
})

// ── Helpers ─────────────────────────────────────────────────────────────────

const TEST_PASSWORD = 'correcthorsebatterystaple'

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
      badgeColor: '#008c95',
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
  mockHandles.getRouteRequestContext.mockReturnValue({
    session: testSession,
    user: undefined,
    role: null,
    clientAddress,
    url,
  })
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

async function doLogin(): Promise<string> {
  await callAction(null, loginFormData())
  expect(mockHandles.sendSignInOtp).toHaveBeenCalled()
  return mockHandles.sendSignInOtp.mock.calls[0]![1] as string
}

async function getOtpRow(userId: bigint) {
  const rows = await db
    .select()
    .from(verification)
    .where(and(eq(verification.purpose, 'signin-otp'), eq(verification.userId, userId)))
  return rows[0] ?? null
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('integration: OTP login flow (real DB)', () => {
  it('full happy path: login → OTP → verify → session established', async () => {
    const admin = await seedAdminUser()

    // Step 1: Login triggers OTP
    const otpCode = await doLogin()
    expect(mockHandles.sendSignInOtp).toHaveBeenCalledTimes(1)
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

    expect(mockHandles.establishLoginSession).toHaveBeenCalledWith(
      db,
      pool,
      testSession,
      expect.objectContaining({ id: admin.id, role: 'admin' }),
      expect.any(Request),
      '127.0.0.1',
      { authMethod: 'otp' },
    )

    expect(result.status).toBe(302)
    expect(result.headers.get('Location')).toBe('/admin')

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

    // Fail count incremented
    expect(testSession.get('otpFailCount')).toBe(1)

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

    // Audit event with lockout recorded
    const lockoutCall = mockHandles.recordAuditEvent.mock.calls.find(
      (call: any[]) => call[0]?.details?.lockedOut === true,
    ) as unknown as [Record<string, unknown>] | undefined
    expect(lockoutCall).toBeDefined()
    expect(lockoutCall![0].action).toBe('otp_failed')
    expect((lockoutCall![0].details as Record<string, unknown>).failCount).toBe(3)
  })

  it('resend issues new OTP and invalidates old one', async () => {
    await seedAdminUser()
    const oldOtp = await doLogin()

    // Resend
    const resendResult = await callAction('resendotp', new FormData())
    expect(resendResult.data?.message).toBe('验证码已重新发送。')

    // New OTP issued
    expect(mockHandles.sendSignInOtp).toHaveBeenCalledTimes(2)
    const newOtp = mockHandles.sendSignInOtp.mock.calls[1]![1] as string
    expect(newOtp).not.toBe(oldOtp)

    // Old OTP code rejected
    const oldResult = await callAction('verifyotp', otpFormData(oldOtp))
    expect(oldResult.data?.error).toBe('验证码无效或已过期。')

    // New OTP code accepted
    const newResult = await callAction('verifyotp', otpFormData(newOtp))
    expect(newResult.status).toBe(302)
    expect(mockHandles.establishLoginSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ role: 'admin' }),
      expect.anything(),
      expect.anything(),
      { authMethod: 'otp' },
    )
  })

  it('expired OTP is rejected and cleaned up', async () => {
    const admin = await seedAdminUser()
    const otpCode = await doLogin()

    // Manually expire the OTP row in DB
    await db
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(and(eq(verification.purpose, 'signin-otp'), eq(verification.userId, admin.id)))

    // Correct code but expired token
    const result = await callAction('verifyotp', otpFormData(otpCode))
    expect(result.data?.error).toBe('验证码无效或已过期。')

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

    // 4th attempt blocked by rate limit
    const result = await callAction(null, loginFormData(), '/admin', uniqueIp)
    expect(result.data?.error).toBe('发送过于频繁，请稍后再试。')
  })

  it('cancel clears session state', async () => {
    await seedAdminUser()
    await doLogin()

    expect(testSession.get('pendingOtpUser')).toBeDefined()
    expect(testSession.get('otpFailCount')).toBe(0)

    const result = await callAction('cancelotp', new FormData())
    expect(result.status).toBe(302)
    expect(result.headers.get('Location')).toContain('/admin/signin')

    // Session clean
    expect(testSession.get('pendingOtpUser')).toBeUndefined()
    expect(testSession.get('otpFailCount')).toBeUndefined()
  })
})
