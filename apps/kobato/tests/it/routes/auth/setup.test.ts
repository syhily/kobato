import { sqliteOf } from '@kobato/db/sqlite/database'
import { oneTimeToken } from '@kobato/db/sqlite/schema/one-time-token'
import { user } from '@kobato/db/sqlite/schema/user'
import { getSetupToken } from '@kobato/server/domains/auth/setup-token'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeSession } from '@kobato/server/tests/utils/session'
import { makeRouteContext } from '@tests/utils/context'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@kobato/server/http/request-context', async () => {
  const { createRequestContextMockModule } = await import('@tests/utils/auth-context-mock')
  return createRequestContextMockModule()
})

vi.mock('@kobato/server/domains/auth/services/setup', async () => {
  const actual = await vi.importActual<typeof import('@kobato/server/domains/auth/services/setup')>(
    '@kobato/server/domains/auth/services/setup',
  )
  return {
    ...actual,
    signUpInitialAdminWithSession: vi.fn(),
  }
})

const CSRF_TOKEN = 'setup-route-csrf-token'

const db = getTestDb()

const mockContext = await import('@kobato/server/http/request-context')
const flows = await import('@kobato/server/domains/auth/services/setup')
const { __resetRateLimitsForTests, tryKeyedRateLimit } = await import('@kobato/server/infra/rate-limit')
const { action, loader } = await import('@/routes/auth/setup/index')

beforeAll(() => {
  const fromProvider = vi.mocked(mockContext.getRequestContext).getMockImplementation()
  vi.mocked(mockContext.getRequestContext).mockImplementation((args) => ({
    ...fromProvider!(args),
    db,
  }))
})

beforeEach(async () => {
  await clearAllTables(db)
  vi.clearAllMocks()
  __resetRateLimitsForTests()
  vi.mocked(flows.signUpInitialAdminWithSession).mockResolvedValue({ type: 'redirect', to: '/admin' })
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

function csrfSession(extra: Record<string, unknown> = {}) {
  return makeSession({ csrfToken: CSRF_TOKEN, ...extra })
}

function withCsrf(formData: FormData): FormData {
  formData.set('csrf_token', CSRF_TOKEN)
  return formData
}

async function mintSetupToken(): Promise<string> {
  return getSetupToken(db)
}

async function seedAdminRow() {
  await sqliteOf(db).insert(user).values({
    name: 'Admin',
    email: 'admin@example.com',
    password: 'not-a-real-hash',
    role: 'admin',
  })
}

describe('routes/setup', () => {
  describe('loader', () => {
    it('returns setupTokenVerified: false and no plaintext token when noAdmin', async () => {
      const result = await loader({
        request: new Request('http://localhost/admin/setup'),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext(),
        params: {},
        pattern: 'admin/setup',
      })

      const payload = (result as { data: Record<string, unknown> }).data
      expect(payload).toBeDefined()
      expect(payload.setupTokenVerified).toBe(false)
      expect(payload).not.toHaveProperty('setupToken')
    })

    it('returns setupTokenVerified: true when session flag is set', async () => {
      const result = await loader({
        request: new Request('http://localhost/admin/setup'),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: makeSession({ setupTokenVerified: true }) }),
        params: {},
        pattern: 'admin/setup',
      })

      const payload = (result as { data: Record<string, unknown> }).data
      expect(payload).toBeDefined()
      expect(payload.setupTokenVerified).toBe(true)
    })

    it('redirects to /admin/signin when installed', async () => {
      await seedAdminRow()

      const response = await catchResponse(
        loader({
          request: new Request('http://localhost/admin/setup'),
          url: new URL('http://localhost/admin/setup'),
          context: makeRouteContext(),
          params: {},
          pattern: 'admin/setup',
        }),
      )

      expect(response.status).toBe(303)
      expect(response.headers.get('Location')).toBe('/admin/signin')
    })
  })

  describe('action: verify-token', () => {
    it('returns setupTokenVerified: true for valid token', async () => {
      const token = await mintSetupToken()

      const formData = new FormData()
      formData.set('intent', 'verify-token')
      formData.set('setup_token', token)

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession() }),
        params: {},
        pattern: 'admin/setup',
      })

      const payload = (result as { data?: Record<string, unknown> }).data
      expect(payload?.setupTokenVerified).toBe(true)
    })

    it('stores only the boolean flag in session, never the plaintext token', async () => {
      const token = await mintSetupToken()
      const session = csrfSession()

      const formData = new FormData()
      formData.set('intent', 'verify-token')
      formData.set('setup_token', token)

      await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session }),
        params: {},
        pattern: 'admin/setup',
      })

      expect(session.data.setupTokenVerified).toBe(true)
      expect(session.data).not.toHaveProperty('setupToken')
      expect(session.data).not.toHaveProperty('setup_token')
    })

    it('returns error for invalid token', async () => {
      await mintSetupToken()

      const formData = new FormData()
      formData.set('intent', 'verify-token')
      formData.set('setup_token', 'invalid-token')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession() }),
        params: {},
        pattern: 'admin/setup',
      })

      const payload = (result as { data?: Record<string, unknown> }).data
      expect(payload?.error).toBe('Setup Token 错误，请查看服务器控制台输出。')
    })

    it('returns 429 when rate limited', async () => {
      for (let i = 0; i < 10; i += 1) {
        await tryKeyedRateLimit('rate-limit:setup-verify:127.0.0.1', { windowSeconds: 3600, maxAttempts: 10 })
      }

      const formData = new FormData()
      formData.set('intent', 'verify-token')
      formData.set('setup_token', 'valid-token')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession() }),
        params: {},
        pattern: 'admin/setup',
      })

      const payload = (result as { data?: Record<string, unknown>; init?: { status?: number } }).data
      const status = (result as { init?: { status?: number } }).init?.status
      expect(payload?.error).toBe('请求过于频繁，请稍后再试。')
      expect(status).toBe(429)
    })
  })

  describe('action: install', () => {
    it('returns error when not verified', async () => {
      const formData = new FormData()
      formData.set('intent', 'install')
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')
      formData.set('password', 'Password1234')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession() }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('请先验证 Setup Token。')
    })

    it('treats missing intent as install (backward compat)', async () => {
      const formData = new FormData()
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')
      formData.set('password', 'Password1234')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession() }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('请先验证 Setup Token。')
    })

    it('returns error when setup token has expired', async () => {
      await sqliteOf(db)
        .insert(oneTimeToken)
        .values({
          key: 'setup_token',
          payload: 'expired-token',
          expiresAt: new Date(Date.now() - 1000),
        })

      const formData = new FormData()
      formData.set('intent', 'install')
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')
      formData.set('password', 'Password1234')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession({ setupTokenVerified: true }) }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('Setup Token 已过期或失效，请重新验证。')
    })

    it('returns the first field error when schema validation fails', async () => {
      await mintSetupToken()

      const formData = new FormData()
      formData.set('intent', 'install')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession({ setupTokenVerified: true }) }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('请填写站点名称')
    })

    it('surfaces the password rule when the password fails complexity validation', async () => {
      await mintSetupToken()

      const formData = new FormData()
      formData.set('intent', 'install')
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')

      formData.set('password', 'password1234')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession({ setupTokenVerified: true }) }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('密码必须包含至少一个大写字母、一个小写字母和一个数字')
      expect((data?.errorDescriptor as { messageKey?: string })?.messageKey).toBe('auth.validation.passwordComplexity')
      expect(flows.signUpInitialAdminWithSession).not.toHaveBeenCalled()
    })

    it('surfaces the password byte-ceiling rule with its max param', async () => {
      await mintSetupToken()

      const formData = new FormData()
      formData.set('intent', 'install')
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')

      formData.set('password', 'Aa1' + 'a'.repeat(70))

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession({ setupTokenVerified: true }) }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('密码过长（最多 72 字节）')
      expect(flows.signUpInitialAdminWithSession).not.toHaveBeenCalled()
    })

    it('surfaces the site-name message when the title is blank', async () => {
      await mintSetupToken()

      const formData = new FormData()
      formData.set('intent', 'install')
      formData.set('title', '')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')
      formData.set('password', 'Password1234')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession({ setupTokenVerified: true }) }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('请填写站点名称')
      expect(flows.signUpInitialAdminWithSession).not.toHaveBeenCalled()
    })

    it('surfaces the email message when the email is malformed', async () => {
      await mintSetupToken()

      const formData = new FormData()
      formData.set('intent', 'install')
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'not-an-email')
      formData.set('password', 'Password1234')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession({ setupTokenVerified: true }) }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('请输入有效的邮箱地址')
      expect(flows.signUpInitialAdminWithSession).not.toHaveBeenCalled()
    })

    it('surfaces the minimum-length rule for a short password', async () => {
      await mintSetupToken()

      const formData = new FormData()
      formData.set('intent', 'install')
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')
      formData.set('password', 'Ab1')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession({ setupTokenVerified: true }) }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('密码长度至少为 10 个字符')
      expect(flows.signUpInitialAdminWithSession).not.toHaveBeenCalled()
    })

    it('rejects an unsupported locale without calling the install service', async () => {
      await mintSetupToken()

      const formData = new FormData()
      formData.set('intent', 'install')
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')
      formData.set('password', 'Password1234')
      formData.set('locale', 'fr-FR')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession({ setupTokenVerified: true }) }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('请填写完整的管理员账号信息。')
      expect(flows.signUpInitialAdminWithSession).not.toHaveBeenCalled()
    })

    it('calls signUpInitialAdminWithSession with parsed data and context', async () => {
      await mintSetupToken()

      const formData = new FormData()
      formData.set('intent', 'install')
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')
      formData.set('password', 'Password1234')
      formData.set('locale', 'zh-HK')

      await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession({ setupTokenVerified: true }) }),
        params: {},
        pattern: 'admin/setup',
      })

      expect(flows.signUpInitialAdminWithSession).toHaveBeenCalledOnce()
      const call = vi.mocked(flows.signUpInitialAdminWithSession).mock.calls[0]!
      expect(call[1]).toMatchObject({
        title: 'Blog',
        name: 'A',
        email: 'a@b.com',
        password: 'Password1234',
        locale: 'zh-HK',
        session: expect.anything(),
        request: expect.anything(),
        clientAddress: '127.0.0.1',
      })
    })

    it('treats an empty-string locale as an invalid field, not the default', async () => {
      await mintSetupToken()

      const formData = new FormData()
      formData.set('intent', 'install')
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')
      formData.set('password', 'Password1234')
      formData.set('locale', '')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession({ setupTokenVerified: true }) }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('请填写完整的管理员账号信息。')
      expect((data?.errorDescriptor as { messageKey?: string })?.messageKey).toBe('auth.setup.error.formIncomplete')
      expect(flows.signUpInitialAdminWithSession).not.toHaveBeenCalled()
    })

    it("defaults the locale to DEFAULT_LOCALE ('zh-CN') when the field is absent", async () => {
      await mintSetupToken()

      const formData = new FormData()
      formData.set('intent', 'install')
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')
      formData.set('password', 'Password1234')

      await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session: csrfSession({ setupTokenVerified: true }) }),
        params: {},
        pattern: 'admin/setup',
      })

      expect(flows.signUpInitialAdminWithSession).toHaveBeenCalledOnce()
      const call = vi.mocked(flows.signUpInitialAdminWithSession).mock.calls[0]!
      expect(call[1]).toMatchObject({ locale: 'zh-CN' })
    })
  })

  describe('action: csrf gate + unknown intents', () => {
    function installFormData(): FormData {
      const formData = new FormData()
      formData.set('intent', 'install')
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')
      formData.set('password', 'Password1234')
      return formData
    }

    async function callAction(formData: FormData, session = csrfSession()) {
      return action({
        request: new Request('http://localhost/admin/setup', { method: 'POST', body: formData }),
        url: new URL('http://localhost/admin/setup'),
        context: makeRouteContext({ session }),
        params: {},
        pattern: 'admin/setup',
      })
    }

    it('rejects verify-token with a wrong CSRF token and leaves the session unverified', async () => {
      await mintSetupToken()
      const session = csrfSession()
      const formData = new FormData()
      formData.set('intent', 'verify-token')
      formData.set('setup_token', 'any-token')
      formData.set('csrf_token', 'wrong-csrf-value')

      const result = await callAction(formData, session)

      const payload = (result as { data?: Record<string, unknown> }).data
      expect(payload?.error).toBe('安全校验失败，请刷新页面后重试。')
      expect((payload?.errorDescriptor as { messageKey?: string })?.messageKey).toBe('error.api.csrfFailed')
      expect(session.data.setupTokenVerified).toBeUndefined()
    })

    it('rejects verify-token with a missing CSRF token', async () => {
      await mintSetupToken()
      const session = csrfSession()
      const formData = new FormData()
      formData.set('intent', 'verify-token')
      formData.set('setup_token', 'any-token')

      const result = await callAction(formData, session)

      const payload = (result as { data?: Record<string, unknown> }).data
      expect((payload?.errorDescriptor as { messageKey?: string })?.messageKey).toBe('error.api.csrfFailed')
      expect(session.data.setupTokenVerified).toBeUndefined()
    })

    it('rejects install on a bad CSRF token even with a verified session, creating no admin', async () => {
      await mintSetupToken()
      const formData = installFormData()
      formData.set('csrf_token', 'wrong-csrf-value')

      const result = await callAction(formData, csrfSession({ setupTokenVerified: true }))

      const payload = (result as { data?: Record<string, unknown> }).data
      expect(payload?.error).toBe('安全校验失败，请刷新页面后重试。')
      expect((payload?.errorDescriptor as { messageKey?: string })?.messageKey).toBe('error.api.csrfFailed')
      expect(flows.signUpInitialAdminWithSession).not.toHaveBeenCalled()
      expect(await sqliteOf(db).select().from(user)).toHaveLength(0)
    })

    it('answers unknownAction for an unrecognized intent', async () => {
      const formData = new FormData()
      formData.set('intent', 'bogus')

      const result = await callAction(withCsrf(formData))

      const payload = (result as { data?: Record<string, unknown> }).data
      expect(payload?.error).toBe('未知操作。')
      expect((payload?.errorDescriptor as { messageKey?: string })?.messageKey).toBe('auth.setup.error.unknownAction')
    })
  })
})
