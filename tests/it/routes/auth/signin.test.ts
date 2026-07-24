import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => {
  const store = new Map<string, unknown>()
  return {
    loggedIn: false,
    otpEnabled: false,
    mailReady: false,
    otpCode: '123456',
    otpVerifyResult: null as { userId: bigint } | null,
    verifyUserPasswordResult: null as {
      id: bigint
      name: string
      email: string
      role: string
      link: string | null
      password: string
    } | null,
    session: {
      get(key: string) {
        return store.get(key)
      },
      set(key: string, value: unknown) {
        store.set(key, value)
      },
      unset(key: string) {
        store.delete(key)
      },
    },
  }
})

vi.mock('@/server/domains/auth/context', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/auth/context')>('@/server/domains/auth/context')
  return {
    ...actual,
    getRouteRequestContext: vi.fn(({ request }: { request: Request }) => ({
      session: state.session,
      user: state.loggedIn ? { id: '1', name: 'admin', email: 'admin@example.com' } : undefined,
      role: state.loggedIn ? ('admin' as const) : null,
      clientAddress: '127.0.0.1',
      url: new URL(request.url),
    })),
    getDbFromContext: vi.fn(() => ({})),
    getPoolFromContext: vi.fn(() => ({})),
  }
})

vi.mock('@/server/domains/auth/session-storage', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/auth/session-storage')>(
    '@/server/domains/auth/session-storage',
  )
  return {
    ...actual,
    commitSessionWithMaxAge: vi.fn(async () => 'blog_session=stub'),
    destroySession: vi.fn(async () => 'blog_session=deleted'),
  }
})

vi.mock('@/server/domains/auth/csrf', () => ({
  validateCsrfForAction: vi.fn(() => true),
}))

vi.mock('@/server/domains/settings/install-gate', () => ({
  ensureInstalledOrRedirect: vi.fn(async () => null),
  ensureNoAdminOrRedirect: vi.fn(async () => null),
  isInstalled: vi.fn(async () => true),
  getInstallState: vi.fn(async () => 'installed' as const),
}))

vi.mock('@/server/infra/db/operations/user', () => ({
  verifyUserPassword: vi.fn(async () => state.verifyUserPasswordResult),
  findUserById: vi.fn(async () => ({
    id: BigInt(1),
    name: 'admin',
    email: 'admin@example.com',
    role: 'admin',
    link: null,
    password: 'hashed',
  })),
  updateUserById: vi.fn(async () => null),
}))

vi.mock('@/server/domains/auth/verification-tokens', () => ({
  consumeToken: vi.fn(async () => null),
  peekToken: vi.fn(async () => null),
  issueResetToken: vi.fn(async () => ({ token: 'reset-token', expiresAt: new Date() })),
  issueOtpToken: vi.fn(async () => ({
    otpCode: state.otpCode,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  })),
  verifyOtpToken: vi.fn(async () => state.otpVerifyResult),
}))

vi.mock('@/server/infra/email/sender', () => ({
  sendSignInOtp: vi.fn(async () => ({ ok: true })),
  sendPasswordReset: vi.fn(async () => ({ ok: true })),
  checkMailReady: vi.fn(() =>
    state.mailReady
      ? ({ ready: true } as const)
      : ({ ready: false, reason: 'disabled', message: '邮件发送已在管理面板中关闭' } as const),
  ),
}))

vi.mock('@/server/infra/rate-limit', () => ({
  tryRateLimit: vi.fn(async () => ({ count: 1, exceeded: false })),
  tryPasswordResetRateLimit: vi.fn(async () => ({ count: 1, exceeded: false })),
  tryPasswordResetByEmailRateLimit: vi.fn(async () => ({ count: 1, exceeded: false })),
  tryOtpSendRateLimit: vi.fn(async () => ({ count: 1, exceeded: false })),
  tryOtpSendByEmailRateLimit: vi.fn(async () => ({ count: 1, exceeded: false })),
  tryOtpVerifyRateLimit: vi.fn(async () => ({ count: 1, exceeded: false })),
  tryOtpVerifyByEmailRateLimit: vi.fn(async () => ({ count: 1, exceeded: false })),
  trySignInByEmailRateLimit: vi.fn(async () => ({ count: 1, exceeded: false })),
}))

vi.mock('@/server/domains/auth/primitives', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/auth/primitives')>(
    '@/server/domains/auth/primitives',
  )
  return {
    ...actual,
    establishLoginSession: vi.fn(async () => ({ sid: 'test-sid', setCookie: 'blog_session=test' })),
    logout: vi.fn(async () => undefined),
  }
})

vi.mock('@/server/domains/audit/services/record', () => ({
  recordAuditEvent: vi.fn(() => undefined),
}))

vi.mock('@/server/domains/comments/services/public-query', () => ({
  hasApprovedComments: vi.fn(async () => false),
}))

vi.mock('@/shared/config/getters', () => ({
  getBlogSettingsBundleSync: vi.fn(() => ({
    security: {
      otp: { enabled: state.otpEnabled },
      csrf: { enabled: true, exemptPaths: [] },
      cors: { enabled: false, origins: [] },
    },
    mail: {
      mail: {
        enabled: state.mailReady,
        host: 'api.zeabur.com',
        apiKey: 'key',
        sender: 'noreply@example.com',
        transport: 'zeabur',
        smtpHost: '',
        smtpPort: 587,
        smtpUser: '',
        smtpPass: '',
        smtpSecure: false,
      },
    },
  })),
}))

const { action, loader } = await import('@/routes/auth/signin')

function resetState() {
  state.loggedIn = false
  state.otpEnabled = false
  state.mailReady = false
  state.otpCode = '123456'
  state.otpVerifyResult = null
  state.verifyUserPasswordResult = null
  state.session.unset('pendingOtpUser')
  state.session.unset('otpFailCount')
}

beforeEach(() => {
  vi.clearAllMocks()
  resetState()
})

async function catchResponse(promise: Promise<unknown>): Promise<Response> {
  try {
    await promise
  } catch (error) {
    if (error instanceof Response) {
      return error
    }
    throw error
  }
  throw new Error('Expected route to throw a Response')
}

function postFormData(body: FormData, search = ''): Parameters<typeof action>[0] {
  return {
    request: new Request(`http://localhost/admin/signin${search}`, {
      method: 'POST',
      body,
    }),
  } as unknown as Parameters<typeof action>[0]
}

function getLoader(search = ''): Parameters<typeof loader>[0] {
  return {
    request: new Request(`http://localhost/admin/signin${search}`),
  } as unknown as Parameters<typeof loader>[0]
}

function extractData(result: unknown): Record<string, unknown> {
  return (result as { data?: Record<string, unknown> }).data ?? {}
}

describe('routes/signin', () => {
  it('sanitizes external logout redirect targets', async () => {
    const response = await catchResponse(
      loader({
        request: new Request('http://localhost/admin/signin?action=logout&redirect_to=https://evil.example/phish'),
      } as unknown as Parameters<typeof loader>[0]),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/')
  })

  it('sanitizes external already-logged-in redirect targets', async () => {
    state.loggedIn = true
    const response = await catchResponse(
      loader({
        request: new Request('http://localhost/admin/signin?redirect_to=//evil.example/phish'),
      } as unknown as Parameters<typeof loader>[0]),
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/')
  })

  it('passes only a sanitized redirect target into login form handling', async () => {
    const result = await action(postFormData(new FormData(), '?redirect_to=https://evil.example/phish'))

    expect(result).toBeInstanceOf(Object)
    expect((result as { data?: Record<string, unknown> }).data).toMatchObject({ redirectTo: '/admin' })
  })

  it('returns verifyotp action when pendingOtpUser exists', async () => {
    state.session.set('pendingOtpUser', {
      userId: '1',
      email: 'admin@example.com',
      expiresAt: Date.now() + 5 * 60 * 1000,
      sentAt: Date.now(),
    })

    const result = await loader(getLoader())
    const d = extractData(result)

    expect(d.action).toBe('verifyotp')
    expect(d.pendingOtpEmail).toBe('admin@example.com')
    expect(d.pendingOtpSentAt).toBeDefined()
  })

  it('redirects to login when pendingOtpUser is expired', async () => {
    state.session.set('pendingOtpUser', {
      userId: '1',
      email: 'admin@example.com',
      expiresAt: Date.now() - 1,
      sentAt: Date.now() - 10 * 60 * 1000,
    })

    const response = await catchResponse(loader(getLoader()))

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/admin/signin?redirect_to=%2F')
    expect(state.session.get('pendingOtpUser')).toBeUndefined()
    expect(state.session.get('otpFailCount')).toBeUndefined()
  })
})

describe('routes/signin — OTP', () => {
  const validLogin = new FormData()
  validLogin.set('email', 'admin@example.com')
  validLogin.set('password', '0123456789')

  const dbUser = {
    id: BigInt(1),
    name: 'admin',
    email: 'admin@example.com',
    role: 'admin' as const,
    link: null,
    password: 'hashed',
  }

  beforeEach(() => {
    state.otpEnabled = true
    state.mailReady = true
    state.verifyUserPasswordResult = dbUser
  })

  it('issues OTP and sends email when OTP is enabled and mail is ready', async () => {
    await action(postFormData(validLogin))

    const { issueOtpToken } = await import('@/server/domains/auth/verification-tokens')
    const { sendSignInOtp } = await import('@/server/infra/email/sender')

    expect(vi.mocked(issueOtpToken)).toHaveBeenCalled()
    expect(vi.mocked(sendSignInOtp)).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'admin@example.com' }),
      state.otpCode,
    )
    expect(state.session.get('pendingOtpUser')).toBeDefined()
    expect(state.session.get('otpFailCount')).toBe(0)
  })

  it('does NOT trigger OTP when mail is not ready', async () => {
    state.mailReady = false
    await action(postFormData(validLogin))

    const { issueOtpToken } = await import('@/server/domains/auth/verification-tokens')
    const { sendSignInOtp } = await import('@/server/infra/email/sender')
    const { establishLoginSession } = await import('@/server/domains/auth/primitives')

    expect(vi.mocked(issueOtpToken)).not.toHaveBeenCalled()
    expect(vi.mocked(sendSignInOtp)).not.toHaveBeenCalled()
    expect(vi.mocked(establishLoginSession)).toHaveBeenCalled()
  })

  it('does NOT trigger OTP when otp.enabled is false', async () => {
    state.otpEnabled = false
    await action(postFormData(validLogin))

    const { issueOtpToken } = await import('@/server/domains/auth/verification-tokens')
    const { sendSignInOtp } = await import('@/server/infra/email/sender')
    const { establishLoginSession } = await import('@/server/domains/auth/primitives')

    expect(vi.mocked(issueOtpToken)).not.toHaveBeenCalled()
    expect(vi.mocked(sendSignInOtp)).not.toHaveBeenCalled()
    expect(vi.mocked(establishLoginSession)).toHaveBeenCalled()
  })

  it('blocks OTP send when rate limit is exceeded', async () => {
    const { tryOtpSendRateLimit } = await import('@/server/infra/rate-limit')
    vi.mocked(tryOtpSendRateLimit).mockResolvedValueOnce({ count: 4, exceeded: true })

    const { issueOtpToken } = await import('@/server/domains/auth/verification-tokens')
    const { sendSignInOtp } = await import('@/server/infra/email/sender')

    await action(postFormData(validLogin))

    expect(vi.mocked(issueOtpToken)).not.toHaveBeenCalled()
    expect(vi.mocked(sendSignInOtp)).not.toHaveBeenCalled()
  })

  it('verifies OTP successfully and establishes session', async () => {
    state.session.set('pendingOtpUser', {
      userId: '1',
      email: 'admin@example.com',
      expiresAt: Date.now() + 5 * 60 * 1000,
      sentAt: Date.now(),
    })
    state.otpVerifyResult = { userId: BigInt(1) }

    const otpBody = new FormData()
    otpBody.set('otp_code', '123456')
    await action(postFormData(otpBody, '?action=verifyotp'))

    const { establishLoginSession } = await import('@/server/domains/auth/primitives')
    expect(vi.mocked(establishLoginSession)).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ id: BigInt(1) }),
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ authMethod: 'otp' }),
    )

    // pendingOtpUser should be cleaned up
    expect(state.session.get('pendingOtpUser')).toBeUndefined()
  })

  it('fails verification with wrong OTP code', async () => {
    state.session.set('pendingOtpUser', {
      userId: '1',
      email: 'admin@example.com',
      expiresAt: Date.now() + 5 * 60 * 1000,
      sentAt: Date.now(),
    })
    state.otpVerifyResult = null

    const otpBody = new FormData()
    otpBody.set('otp_code', '000000')
    await action(postFormData(otpBody, '?action=verifyotp'))

    // otpFailCount should increment
    expect(state.session.get('otpFailCount')).toBe(1)
  })

  it('locks out after 3 failed OTP attempts', async () => {
    state.session.set('pendingOtpUser', {
      userId: '1',
      email: 'admin@example.com',
      expiresAt: Date.now() + 5 * 60 * 1000,
      sentAt: Date.now(),
    })
    state.otpVerifyResult = null

    const otpBody = new FormData()
    otpBody.set('otp_code', '000000')

    for (let i = 0; i < 3; i++) {
      await action(postFormData(otpBody, '?action=verifyotp'))
    }

    // pendingOtpUser should be cleared (locked out)
    expect(state.session.get('pendingOtpUser')).toBeUndefined()
  })

  it('resends OTP and resets fail count', async () => {
    state.session.set('otpFailCount', 2)
    state.session.set('pendingOtpUser', {
      userId: '1',
      email: 'admin@example.com',
      expiresAt: Date.now() + 5 * 60 * 1000,
      sentAt: Date.now(),
    })

    await action(postFormData(new FormData(), '?action=resendotp'))

    const { sendSignInOtp } = await import('@/server/infra/email/sender')
    expect(vi.mocked(sendSignInOtp)).toHaveBeenCalled()
    expect(state.session.get('otpFailCount')).toBe(0)
  })

  it('cancels OTP flow and clears pending state', async () => {
    state.session.set('pendingOtpUser', {
      userId: '1',
      email: 'admin@example.com',
      expiresAt: Date.now() + 5 * 60 * 1000,
      sentAt: Date.now(),
    })

    await action(postFormData(new FormData(), '?action=cancelotp'))

    expect(state.session.get('pendingOtpUser')).toBeUndefined()
    expect(state.session.get('otpFailCount')).toBeUndefined()
  })

  it('blocks OTP verify when rate limit is exceeded', async () => {
    state.session.set('pendingOtpUser', {
      userId: '1',
      email: 'admin@example.com',
      expiresAt: Date.now() + 5 * 60 * 1000,
      sentAt: Date.now(),
    })

    const { tryOtpVerifyRateLimit } = await import('@/server/infra/rate-limit')
    vi.mocked(tryOtpVerifyRateLimit).mockResolvedValueOnce({ count: 6, exceeded: true })

    state.otpVerifyResult = { userId: BigInt(1) }
    const otpBody = new FormData()
    otpBody.set('otp_code', '123456')
    await action(postFormData(otpBody, '?action=verifyotp'))

    const { establishLoginSession } = await import('@/server/domains/auth/primitives')
    // establishLoginSession should NOT be called because rate limit blocked it
    expect(vi.mocked(establishLoginSession)).not.toHaveBeenCalled()
  })

  // ── Login edge cases ─────────────────────────────────────────────────────

  it('rejects invalid email/password (schema validation)', async () => {
    const badForm = new FormData()
    badForm.set('email', 'not-an-email')
    badForm.set('password', '')

    const result = await action(postFormData(badForm))
    const d = extractData(result)

    expect(d.error).toBe('请填写正确的邮箱和密码。')
  })

  it('blocks login when login rate limit exceeded', async () => {
    const { tryRateLimit } = await import('@/server/infra/rate-limit')
    vi.mocked(tryRateLimit).mockResolvedValueOnce({ count: 10, exceeded: true })

    const result = await action(postFormData(validLogin))
    const d = extractData(result)

    expect(d.error).toBe('登录失败次数过多，请稍后再试。')
  })

  it('wrong password returns redirect without triggering OTP', async () => {
    state.verifyUserPasswordResult = null

    const result = await action(postFormData(validLogin))
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(302)
    expect((result as Response).headers.get('Location')).toContain('error=invalid_credentials')

    const { issueOtpToken } = await import('@/server/domains/auth/verification-tokens')
    expect(vi.mocked(issueOtpToken)).not.toHaveBeenCalled()
  })

  it('returns error when first-time OTP email send fails', async () => {
    const { sendSignInOtp } = await import('@/server/infra/email/sender')
    vi.mocked(sendSignInOtp).mockResolvedValueOnce({ ok: false, reason: 'upstream', status: 500, message: 'fail' })

    const result = await action(postFormData(validLogin))
    const d = extractData(result)

    expect(d.error).toBe('验证码发送失败，请稍后重试。')
    expect(state.session.get('pendingOtpUser')).toBeUndefined()
  })

  it('returns error when first-time OTP email throws', async () => {
    const { sendSignInOtp } = await import('@/server/infra/email/sender')
    vi.mocked(sendSignInOtp).mockRejectedValueOnce(new Error('network timeout'))

    const result = await action(postFormData(validLogin))
    const d = extractData(result)

    expect(d.error).toBe('验证码发送失败，请稍后重试。')
    expect(state.session.get('pendingOtpUser')).toBeUndefined()
  })

  // ── verifyotp edge cases ─────────────────────────────────────────────────

  it('rejects verifyotp when no pendingOtpUser in session', async () => {
    const otpBody = new FormData()
    otpBody.set('otp_code', '123456')
    const result = await action(postFormData(otpBody, '?action=verifyotp'))
    const d = extractData(result)

    expect(d.error).toBe('请先完成登录。')
  })

  it('returns error when OTP valid but user not found', async () => {
    state.session.set('pendingOtpUser', {
      userId: '1',
      email: 'admin@example.com',
      expiresAt: Date.now() + 5 * 60 * 1000,
      sentAt: Date.now(),
    })
    state.otpVerifyResult = { userId: BigInt(1) }

    const { findUserById } = await import('@/server/infra/db/operations/user')
    vi.mocked(findUserById).mockResolvedValueOnce(null)

    const otpBody = new FormData()
    otpBody.set('otp_code', '123456')
    const result = await action(postFormData(otpBody, '?action=verifyotp'))
    const d = extractData(result)

    expect(d.error).toBe('账户状态异常，无法登录。')
    const { establishLoginSession } = await import('@/server/domains/auth/primitives')
    expect(vi.mocked(establishLoginSession)).not.toHaveBeenCalled()
  })

  it('cleans up otpFailCount on successful verification', async () => {
    state.session.set('pendingOtpUser', {
      userId: '1',
      email: 'admin@example.com',
      expiresAt: Date.now() + 5 * 60 * 1000,
      sentAt: Date.now(),
    })
    state.session.set('otpFailCount', 2)
    state.otpVerifyResult = { userId: BigInt(1) }

    const otpBody = new FormData()
    otpBody.set('otp_code', '123456')
    await action(postFormData(otpBody, '?action=verifyotp'))

    expect(state.session.get('otpFailCount')).toBeUndefined()
  })

  // ── resendotp edge cases ─────────────────────────────────────────────────

  it('rejects resend when no pendingOtpUser in session', async () => {
    const result = await action(postFormData(new FormData(), '?action=resendotp'))
    const d = extractData(result)

    expect(d.error).toBe('请先完成登录。')
  })

  it('returns error when email send fails on resend', async () => {
    state.session.set('pendingOtpUser', {
      userId: '1',
      email: 'admin@example.com',
      expiresAt: Date.now() + 5 * 60 * 1000,
      sentAt: Date.now(),
    })

    const { sendSignInOtp } = await import('@/server/infra/email/sender')
    vi.mocked(sendSignInOtp).mockResolvedValueOnce({ ok: false, reason: 'upstream', status: 500, message: 'fail' })

    const result = await action(postFormData(new FormData(), '?action=resendotp'))
    const d = extractData(result)

    expect(d.error).toBe('验证码发送失败，请稍后重试。')
  })

  it('updates pendingOtpUser with new expiresAt and sentAt on resend', async () => {
    const oldExpires = Date.now() + 60 * 1000
    const oldSent = Date.now() - 4 * 60 * 1000
    state.session.set('pendingOtpUser', {
      userId: '1',
      email: 'admin@example.com',
      expiresAt: oldExpires,
      sentAt: oldSent,
    })

    await action(postFormData(new FormData(), '?action=resendotp'))

    const updated = state.session.get('pendingOtpUser') as { expiresAt: number; sentAt: number }
    expect(updated.expiresAt).toBeGreaterThan(oldExpires)
    expect(updated.sentAt).toBeGreaterThan(oldSent)
  })

  it('blocks resend when rate limit exceeded', async () => {
    state.session.set('pendingOtpUser', {
      userId: '1',
      email: 'admin@example.com',
      expiresAt: Date.now() + 5 * 60 * 1000,
      sentAt: Date.now(),
    })

    const { tryOtpSendRateLimit } = await import('@/server/infra/rate-limit')
    vi.mocked(tryOtpSendRateLimit).mockResolvedValueOnce({ count: 4, exceeded: true })

    const result = await action(postFormData(new FormData(), '?action=resendotp'))
    const d = extractData(result)

    expect(d.error).toBe('发送过于频繁，请稍后再试。')
    const { issueOtpToken } = await import('@/server/domains/auth/verification-tokens')
    expect(vi.mocked(issueOtpToken)).not.toHaveBeenCalled()
  })

  // ── cancelotp edge cases ─────────────────────────────────────────────────

  it('preserves redirectTo in cancel redirect', async () => {
    state.session.set('pendingOtpUser', {
      userId: '1',
      email: 'admin@example.com',
      expiresAt: Date.now() + 5 * 60 * 1000,
      sentAt: Date.now(),
    })

    const result = await action(postFormData(new FormData(), '?action=cancelotp&redirect_to=/admin/posts'))

    const response = result as Response
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain(encodeURIComponent('/admin/posts'))
  })
})
