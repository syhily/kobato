import { sqliteOf } from '@kobato/db/sqlite/database'
import { oneTimeToken } from '@kobato/db/sqlite/schema/one-time-token'
import { user } from '@kobato/db/sqlite/schema/user'
import { getSetupToken } from '@kobato/server/domains/auth/setup-token'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeSession } from '@kobato/server/tests/utils/session'
import { makeRouteContext } from '@tests/utils/context'
import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@kobato/api/browser/client', async () => {
  const { createOrpcClientMockModule } = await import('@tests/utils/orpc-client-mock')
  return createOrpcClientMockModule()
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

const flows = await import('@kobato/server/domains/auth/services/setup')
const { __resetRateLimitsForTests, tryKeyedRateLimit } = await import('@kobato/server/infra/rate-limit')
const route = await import('@/routes/auth/setup/index')

function routeContext(options: Record<string, unknown> = {}) {
  return makeRouteContext({ db, session: csrfSession(), ...options })
}

async function loader(args: Record<string, unknown> & { request: Request }): Promise<unknown> {
  void args
  return route.clientLoader()
}

async function action(args: Record<string, unknown> & { request: Request }): Promise<unknown> {
  return route.clientAction({ request: args.request } as never)
}

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

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
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
        context: routeContext(),
        params: {},
        pattern: 'admin/setup',
      })

      const payload = (result as { data: Record<string, unknown> }).data
      expect(payload).toBeDefined()
      expect(payload.setupTokenVerified).toBe(false)
      expect(payload).not.toHaveProperty('setupToken')
    })

    it('returns setupTokenVerified: true when the flag is bound to the live token fingerprint', async () => {
      const token = await mintSetupToken()
      const result = await loader({
        request: new Request('http://localhost/admin/setup'),
        url: new URL('http://localhost/admin/setup'),
        context: routeContext({
          session: csrfSession({ setupTokenVerified: true, setupTokenVerifiedFor: sha256(token) }),
        }),
        params: {},
        pattern: 'admin/setup',
      })

      const payload = (result as { data: Record<string, unknown> }).data
      expect(payload).toBeDefined()
      expect(payload.setupTokenVerified).toBe(true)
    })

    it('reports the flag as unverified once the live token no longer matches the fingerprint', async () => {
      await mintSetupToken()
      const result = await loader({
        request: new Request('http://localhost/admin/setup'),
        url: new URL('http://localhost/admin/setup'),
        context: routeContext({
          session: csrfSession({ setupTokenVerified: true, setupTokenVerifiedFor: sha256('other-token') }),
        }),
        params: {},
        pattern: 'admin/setup',
      })

      const payload = (result as { data: Record<string, unknown> }).data
      expect(payload.setupTokenVerified).toBe(false)
    })

    it('redirects to /admin/signin when installed', async () => {
      await seedAdminRow()

      const response = await catchResponse(
        loader({
          request: new Request('http://localhost/admin/setup'),
          url: new URL('http://localhost/admin/setup'),
          context: routeContext(),
          params: {},
          pattern: 'admin/setup',
        }),
      )

      expect(response.status).toBe(303)
      expect(response.headers.get('Location')).toBe('/admin/signin')
    })
  })

  describe('action gate', () => {
    it('redirects to /admin/signin when installed', async () => {
      await seedAdminRow()

      const formData = new FormData()
      formData.set('intent', 'verify-token')
      formData.set('setup_token', 'any-token')

      const response = await catchResponse(
        action({
          request: new Request('http://localhost/admin/setup', {
            method: 'POST',
            body: withCsrf(formData),
          }),
          url: new URL('http://localhost/admin/setup'),
          context: routeContext({ session: csrfSession() }),
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
        context: routeContext({ session: csrfSession() }),
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
        context: routeContext({ session }),
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
        context: routeContext({ session: csrfSession() }),
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
        context: routeContext({ session: csrfSession() }),
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
        context: routeContext({ session: csrfSession() }),
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
        context: routeContext({ session: csrfSession() }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('请先验证 Setup Token。')
    })

    it('blocks install once the verified setup token expired, without minting a fresh one', async () => {
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
        context: routeContext({
          session: csrfSession({ setupTokenVerified: true, setupTokenVerifiedFor: sha256('expired-token') }),
        }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('Setup Token 已过期或失效，请重新验证。')
      expect((data?.errorDescriptor as { messageKey?: string })?.messageKey).toBe('auth.setup.error.tokenExpired')
      const rows = await sqliteOf(db).select().from(oneTimeToken)
      expect(rows[0]?.payload).toBe('expired-token')
    })

    it('blocks install when the live token was re-minted after verification', async () => {
      await sqliteOf(db)
        .insert(oneTimeToken)
        .values({
          key: 'setup_token',
          payload: 're-minted-token',
          expiresAt: new Date(Date.now() + 60_000),
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
        context: routeContext({
          session: csrfSession({ setupTokenVerified: true, setupTokenVerifiedFor: sha256('expired-token') }),
        }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('Setup Token 已过期或失效，请重新验证。')
    })

    it('returns the first field error when schema validation fails', async () => {
      const mintedToken = await mintSetupToken()

      const formData = new FormData()
      formData.set('intent', 'install')

      const result = await action({
        request: new Request('http://localhost/admin/setup', {
          method: 'POST',
          body: withCsrf(formData),
        }),
        url: new URL('http://localhost/admin/setup'),
        context: routeContext({
          session: csrfSession({ setupTokenVerified: true, setupTokenVerifiedFor: sha256(mintedToken) }),
        }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('请填写站点名称')
    })

    it('surfaces the password rule when the password fails complexity validation', async () => {
      const mintedToken = await mintSetupToken()

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
        context: routeContext({
          session: csrfSession({ setupTokenVerified: true, setupTokenVerifiedFor: sha256(mintedToken) }),
        }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('密码必须包含至少一个大写字母、一个小写字母和一个数字')
      expect((data?.errorDescriptor as { messageKey?: string })?.messageKey).toBe('auth.validation.passwordComplexity')
      expect(flows.signUpInitialAdminWithSession).not.toHaveBeenCalled()
    })

    it('surfaces the password byte-ceiling rule with its max param', async () => {
      const mintedToken = await mintSetupToken()

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
        context: routeContext({
          session: csrfSession({ setupTokenVerified: true, setupTokenVerifiedFor: sha256(mintedToken) }),
        }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('密码过长（最多 72 字节）')
      expect(flows.signUpInitialAdminWithSession).not.toHaveBeenCalled()
    })

    it('surfaces the site-name message when the title is blank', async () => {
      const mintedToken = await mintSetupToken()

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
        context: routeContext({
          session: csrfSession({ setupTokenVerified: true, setupTokenVerifiedFor: sha256(mintedToken) }),
        }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('请填写站点名称')
      expect(flows.signUpInitialAdminWithSession).not.toHaveBeenCalled()
    })

    it('surfaces the email message when the email is malformed', async () => {
      const mintedToken = await mintSetupToken()

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
        context: routeContext({
          session: csrfSession({ setupTokenVerified: true, setupTokenVerifiedFor: sha256(mintedToken) }),
        }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('请输入有效的邮箱地址')
      expect(flows.signUpInitialAdminWithSession).not.toHaveBeenCalled()
    })

    it('surfaces the minimum-length rule for a short password', async () => {
      const mintedToken = await mintSetupToken()

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
        context: routeContext({
          session: csrfSession({ setupTokenVerified: true, setupTokenVerifiedFor: sha256(mintedToken) }),
        }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('密码长度至少为 10 个字符')
      expect(flows.signUpInitialAdminWithSession).not.toHaveBeenCalled()
    })

    it('rejects an unsupported locale without calling the install service', async () => {
      const mintedToken = await mintSetupToken()

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
        context: routeContext({
          session: csrfSession({ setupTokenVerified: true, setupTokenVerifiedFor: sha256(mintedToken) }),
        }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('请填写完整的管理员账号信息。')
      expect(flows.signUpInitialAdminWithSession).not.toHaveBeenCalled()
    })

    it('calls signUpInitialAdminWithSession with parsed data and context', async () => {
      const mintedToken = await mintSetupToken()

      const formData = new FormData()
      formData.set('intent', 'install')
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')
      formData.set('password', 'Password1234')
      formData.set('locale', 'zh-HK')

      await catchResponse(
        action({
          request: new Request('http://localhost/admin/setup', {
            method: 'POST',
            body: withCsrf(formData),
          }),
          url: new URL('http://localhost/admin/setup'),
          context: routeContext({
            session: csrfSession({ setupTokenVerified: true, setupTokenVerifiedFor: sha256(mintedToken) }),
          }),
          params: {},
          pattern: 'admin/setup',
        }),
      )

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
      const mintedToken = await mintSetupToken()

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
        context: routeContext({
          session: csrfSession({ setupTokenVerified: true, setupTokenVerifiedFor: sha256(mintedToken) }),
        }),
        params: {},
        pattern: 'admin/setup',
      })

      const data = (result as { data?: Record<string, unknown> }).data
      expect(data?.error).toBe('请填写完整的管理员账号信息。')
      expect((data?.errorDescriptor as { messageKey?: string })?.messageKey).toBe('auth.setup.error.formIncomplete')
      expect(flows.signUpInitialAdminWithSession).not.toHaveBeenCalled()
    })

    it("defaults the locale to DEFAULT_LOCALE ('zh-CN') when the field is absent", async () => {
      const mintedToken = await mintSetupToken()

      const formData = new FormData()
      formData.set('intent', 'install')
      formData.set('title', 'Blog')
      formData.set('name', 'A')
      formData.set('email', 'a@b.com')
      formData.set('password', 'Password1234')

      await catchResponse(
        action({
          request: new Request('http://localhost/admin/setup', {
            method: 'POST',
            body: withCsrf(formData),
          }),
          url: new URL('http://localhost/admin/setup'),
          context: routeContext({
            session: csrfSession({ setupTokenVerified: true, setupTokenVerifiedFor: sha256(mintedToken) }),
          }),
          params: {},
          pattern: 'admin/setup',
        }),
      )

      expect(flows.signUpInitialAdminWithSession).toHaveBeenCalledOnce()
      const call = vi.mocked(flows.signUpInitialAdminWithSession).mock.calls[0]!
      expect(call[1]).toMatchObject({ locale: 'zh-CN' })
    })
  })

  describe('action: csrf gate + unknown intents', () => {
    async function callAction(formData: FormData, session = csrfSession()) {
      return action({
        request: new Request('http://localhost/admin/setup', { method: 'POST', body: formData }),
        url: new URL('http://localhost/admin/setup'),
        context: routeContext({ session }),
        params: {},
        pattern: 'admin/setup',
      })
    }

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
