import { parseCommentTokensCookie } from '@kobato/server/domains/comments/services/comment-token.ts'
import {
  authedProc,
  commentTokenCookie,
  implementAuthed,
  implementPublic,
  orpcInputValidationInterceptor,
  passkeyGuard,
  publicProc,
  resourceRateLimit,
} from '@kobato/server/http/orpc-base.ts'
import { ActionFailure, DomainError } from '@kobato/server/infra/http/errors.ts'
import { __rateLimitKeysForTests, __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit.ts'
import { makePublicCtx } from '@kobato/server/tests/utils/mock-ctx.ts'
import {
  resetBlogSettingsForTests,
  setBlogSettingsBundleForTests,
  TEST_BLOG_SETTINGS_BUNDLE,
} from '@kobato/settings/tests/utils/blog-settings.ts'
import { oc } from '@orpc/contract'
import { call } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

function seedSingleAttemptResourceBucket() {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    rateLimit: {
      ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
      resource: { windowSeconds: 60, maxAttempts: 1 },
    },
  })
}

const router = {
  ping: publicProc
    .route({ method: 'POST', path: '/ping' })
    .input(z.object({ msg: z.string().min(1).max(20) }))
    .output(z.object({ echoed: z.string() }))
    .use(resourceRateLimit)
    .handler(({ input }) => ({ echoed: input.msg })),
}

const handler = new RPCHandler(router, { clientInterceptors: [orpcInputValidationInterceptor] })

async function callPing(input: unknown) {
  const result = await handler.handle(
    new Request('http://localhost/rpc/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: input }),
    }),
    { prefix: '/rpc', context: makePublicCtx() },
  )
  if (!result.matched) {
    throw new Error('No route matched for /ping')
  }
  return result.response
}

describe('resourceRateLimit oRPC middleware', () => {
  beforeEach(() => {
    __resetRateLimitsForTests()
  })

  it('passes through under the budget, reading the client address from the context', async () => {
    const res = await callPing({ msg: 'hi' })

    expect(res.status).toBe(200)
    const body = (await res.json()) as { json: { echoed: string } }
    expect(body.json.echoed).toBe('hi')
    expect(__rateLimitKeysForTests()).toEqual(['rate-limit:resource:127.0.0.1'])
  })

  it('answers 429 with the ORPCError shape when exceeded', async () => {
    seedSingleAttemptResourceBucket()
    expect((await callPing({ msg: 'hi' })).status).toBe(200)

    const res = await callPing({ msg: 'hi' })

    expect(res.status).toBe(429)
    const text = await res.text()
    expect(text).toContain('TOO_MANY_REQUESTS')
    expect(text).toContain('请求过于频繁，请稍后再试。')
  })

  it('validates the input before the guard, matching the old inline order', async () => {
    seedSingleAttemptResourceBucket()

    const res = await callPing({ msg: '' })

    expect(res.status).not.toBe(429)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(__rateLimitKeysForTests()).toEqual([])
  })
})

const passkeyRouter = {
  passkeyPing: publicProc
    .route({ method: 'POST', path: '/passkey-ping' })
    .input(z.object({}))
    .output(z.object({ ok: z.boolean() }))
    .use(passkeyGuard)
    .handler(() => ({ ok: true })),
}

const passkeyHandler = new RPCHandler(passkeyRouter)

async function callPasskeyPing(input: unknown) {
  const result = await passkeyHandler.handle(
    new Request('http://localhost/rpc/passkeyPing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: input }),
    }),
    { prefix: '/rpc', context: makePublicCtx() },
  )
  if (!result.matched) {
    throw new Error('No route matched for /passkeyPing')
  }
  return result.response
}

function seedPasskeyBundle(enabled: boolean) {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    security: { ...TEST_BLOG_SETTINGS_BUNDLE.security!, passkey: { enabled } },
  })
}

describe('passkeyGuard oRPC middleware', () => {
  it('passes through when the passkey feature is enabled', async () => {
    seedPasskeyBundle(true)

    const res = await callPasskeyPing({})

    expect(res.status).toBe(200)
    const body = (await res.json()) as { json: { ok: boolean } }
    expect(body.json.ok).toBe(true)
  })

  it('answers 400 with the canonical DomainError shape when disabled', async () => {
    seedPasskeyBundle(false)

    const res = await callPasskeyPing({})

    expect(res.status).toBe(400)
    const text = await res.text()
    expect(text).toContain('BAD_REQUEST')
    expect(text).toContain('Passkey 登录未启用。')
  })
})

const failingRouter = {
  actionFailure: publicProc
    .route({ method: 'POST', path: '/fail/action' })
    .input(z.object({}))
    .output(z.object({ ok: z.boolean() }))
    .handler(() => {
      throw new ActionFailure(429, 'slow down', [{ message: 'dup' }], { 'Retry-After': '30' })
    }),
  domainError: publicProc
    .route({ method: 'POST', path: '/fail/domain' })
    .input(z.object({}))
    .output(z.object({ ok: z.boolean() }))
    .handler(() => {
      throw new DomainError('BAD_REQUEST', 'bad patch', [{ message: 'unknown key', path: ['seo'] }])
    }),
  descriptorDomainError: publicProc
    .route({ method: 'POST', path: '/fail/descriptor' })
    .input(z.object({}))
    .output(z.object({ ok: z.boolean() }))
    .handler(() => {
      throw new DomainError('NOT_FOUND', { messageKey: 'error.api.notFound', fallbackMessage: 'Resource not found.' })
    }),
  descriptorIssueDomainError: publicProc
    .route({ method: 'POST', path: '/fail/descriptor-issue' })
    .input(z.object({}))
    .output(z.object({ ok: z.boolean() }))
    .handler(() => {
      throw new DomainError(
        'BAD_REQUEST',
        { messageKey: 'admin.settings.errors.invalid', fallbackMessage: 'The settings data is invalid' },
        [
          {
            messageKey: 'admin.settings.rateLimit.error.windowMin',
            params: { min: 60 },
            fallbackMessage: 'The time window must be at least 60 seconds',
            path: ['signIn', 'windowSeconds'],
          },
        ],
      )
    }),
}

describe('domainErrorGuard translation', () => {
  it('summarizes oRPC input validation issues with their field paths', async () => {
    const res = await callPing({ msg: '' })

    expect(res.status).toBe(400)
    const body = (await res.json()) as {
      json: { message: string; data: { issues: Array<{ path: string[]; message: string }> } }
    }
    expect(body.json.message).toContain('msg')
    expect(body.json.message).not.toBe('Invalid Input')
    expect(body.json.data.issues[0]).toMatchObject({ path: ['msg'] })
  })

  it('forwards ActionFailure status, summarized message, and the descriptor data', async () => {
    const ctx = makePublicCtx()
    await expect(call(failingRouter.actionFailure, {}, { context: ctx })).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      status: 429,
      message: 'slow down：dup',
      data: {
        descriptor: {
          messageKey: 'error.api.rawMessage',
          params: { message: 'slow down' },
          fallbackMessage: 'slow down',
        },
        issues: [
          {
            messageKey: 'error.api.rawMessage',
            params: { message: 'dup' },
            fallbackMessage: 'dup',
            message: 'dup',
          },
        ],
      },
    })
    expect(ctx.responseHeaders.get('Retry-After')).toBe('30')
  })

  it('keeps the DomainError code and carries descriptor + issue paths in data', async () => {
    const ctx = makePublicCtx()
    await expect(call(failingRouter.domainError, {}, { context: ctx })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      status: 400,
      message: 'bad patch：seo：unknown key',
      data: {
        descriptor: { messageKey: 'error.api.rawMessage', fallbackMessage: 'bad patch' },
        issues: [
          { messageKey: 'error.api.rawMessage', fallbackMessage: 'unknown key', message: 'unknown key', path: ['seo'] },
        ],
      },
    })
  })

  it('translates a descriptor-based DomainError for the seeded locale', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale: 'en-US' },
    })
    try {
      const ctx = makePublicCtx()
      await expect(call(failingRouter.descriptorDomainError, {}, { context: ctx })).rejects.toMatchObject({
        code: 'NOT_FOUND',
        status: 404,
        message: 'Resource not found.',
        data: { descriptor: { messageKey: 'error.api.notFound' } },
      })
    } finally {
      resetBlogSettingsForTests()
    }
  })

  it('carries each issue’s localized message next to its descriptor', async () => {
    const ctx = makePublicCtx()
    await expect(call(failingRouter.descriptorIssueDomainError, {}, { context: ctx })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      status: 400,
      message: '设置数据无效：signIn.windowSeconds：时间窗口不能小于 60 秒',
      data: {
        descriptor: { messageKey: 'admin.settings.errors.invalid' },
        issues: [
          {
            messageKey: 'admin.settings.rateLimit.error.windowMin',
            params: { min: 60 },
            fallbackMessage: 'The time window must be at least 60 seconds',
            message: '时间窗口不能小于 60 秒',
            path: ['signIn', 'windowSeconds'],
          },
        ],
      },
    })
  })
})

const gateRouter = {
  whoami: authedProc
    .route({ method: 'POST', path: '/whoami' })
    .input(z.object({}))
    .handler(({ context }) => ({ id: context.viewer.id })),
}

describe('localized middleware gates', () => {
  it('answers 401 with the localized message and its descriptor', async () => {
    const ctx = makePublicCtx()
    await expect(call(gateRouter.whoami, {}, { context: ctx })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: '需要登录后再操作。',
      data: { descriptor: { messageKey: 'error.api.unauthorized' } },
    })
  })
})

const REFRESH_VALUE = { 'pk-1': [{ token: 'tok-1', expiresAt: 123 }] }

const tokenRouter = {
  read: publicProc
    .route({ method: 'GET', path: '/ct/read' })
    .input(z.object({}))
    .output(z.object({ pages: z.array(z.string()) }))
    .use(commentTokenCookie)
    .handler(({ context }) => ({ pages: Object.keys(context.commentTokens.cookie) })),
  refresh: publicProc
    .route({ method: 'POST', path: '/ct/refresh' })
    .input(z.object({}))
    .output(z.object({ ok: z.boolean() }))
    .use(commentTokenCookie)
    .handler(({ context }) => {
      context.commentTokens.refreshed = REFRESH_VALUE
      return { ok: true }
    }),
  refreshThenThrow: publicProc
    .route({ method: 'POST', path: '/ct/refresh-then-throw' })
    .input(z.object({}))
    .output(z.object({ ok: z.boolean() }))
    .use(commentTokenCookie)
    .handler(({ context }) => {
      context.commentTokens.refreshed = REFRESH_VALUE
      throw new DomainError('NOT_FOUND')
    }),
}

function makeCookieCtx(): ReturnType<typeof makePublicCtx> {
  const ctx = makePublicCtx()
  const payload = { 'pk-1': [{ token: 'tok-1', expiresAt: 999 }] }
  ctx.requestFacts = { ...ctx.requestFacts, cookie: `__comment_tokens=${encodeURIComponent(JSON.stringify(payload))}` }
  return ctx
}

describe('commentTokenCookie oRPC middleware', () => {
  it('parses the request cookie into context.commentTokens.cookie', async () => {
    const ctx = makeCookieCtx()
    const res = await call(tokenRouter.read, {}, { context: ctx })
    expect(res).toEqual({ pages: ['pk-1'] })
    expect(ctx.responseHeaders.get('Set-Cookie')).toBeNull()
  })

  it('writes the refreshed cookie back as Set-Cookie after the handler', async () => {
    const ctx = makePublicCtx()
    const res = await call(tokenRouter.refresh, {}, { context: ctx })
    expect(res).toEqual({ ok: true })
    const setCookie = ctx.responseHeaders.get('Set-Cookie')
    expect(setCookie).toContain('__comment_tokens=')
    expect(parseCommentTokensCookie(setCookie)).toEqual(REFRESH_VALUE)
  })

  it('still writes the cookie when the handler throws after assigning refreshed', async () => {
    const ctx = makePublicCtx()
    await expect(call(tokenRouter.refreshThenThrow, {}, { context: ctx })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
    expect(ctx.responseHeaders.get('Set-Cookie')).toContain('__comment_tokens=')
  })
})

const implementerContract = {
  ping: oc
    .route({ method: 'POST', path: '/impl/ping' })
    .input(z.object({ msg: z.string() }))
    .output(z.object({ ok: z.boolean() })),
  boom: oc
    .route({ method: 'POST', path: '/impl/boom' })
    .input(z.object({}))
    .output(z.object({ ok: z.boolean() })),
}

const publicImpl = implementPublic(implementerContract)
const publicImplRouter = publicImpl.router({
  ping: publicImpl.ping.handler(({ context }) => ({ ok: context.viewer === null })),
  boom: publicImpl.boom.handler(() => {
    throw new DomainError('BAD_REQUEST', 'impl boom')
  }),
})

const authedContract = {
  me: oc
    .route({ method: 'POST', path: '/impl/me' })
    .input(z.object({}))
    .output(z.object({ id: z.string() })),
}
const authedImpl = implementAuthed(authedContract)
const authedImplRouter = authedImpl.router({
  me: authedImpl.me.handler(({ context }) => ({ id: context.viewer.id })),
})

describe('contract implementer bases', () => {
  it('flows the HandlerContext and validates the contract input before the handler', async () => {
    const ctx = makePublicCtx()
    await expect(call(publicImplRouter.ping, { msg: 'hi' }, { context: ctx })).resolves.toEqual({ ok: true })
    await expect(
      call(publicImplRouter.ping, { wrong: 1 } as unknown as { msg: string }, { context: ctx }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    })
  })

  it('translates DomainError through the shared domain guard', async () => {
    const ctx = makePublicCtx()
    await expect(call(publicImplRouter.boom, {}, { context: ctx })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'impl boom',
      data: {
        descriptor: { messageKey: 'error.api.rawMessage', params: { message: 'impl boom' } },
      },
    })
  })

  it('mounts the base middleware exactly once per procedure', () => {
    for (const procedure of [publicImplRouter.ping, publicImplRouter.boom]) {
      expect(procedure['~orpc'].middlewares).toHaveLength(1)
    }
  })

  it('keeps the auth gate outermost on the authed base', async () => {
    await expect(call(authedImplRouter.me, {}, { context: makePublicCtx() })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: '需要登录后再操作。',
    })
  })
})
