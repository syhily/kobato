import { call } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { makePublicCtx } from '#/_helpers/mock-ctx'
import { commentTokenCookie, passkeyGuard, publicProc, resourceRateLimit } from '@/server/http/orpc-base'
import { ActionFailure, DomainError } from '@/server/infra/http/errors'
import { __rateLimitKeysForTests, __resetRateLimitsForTests } from '@/server/infra/rate-limit'
import { parseCommentTokensCookie } from '@/shared/utils/comment-token'

/** Shrink the `resourceIp` bucket so the second hit in a window trips. */
function seedSingleAttemptResourceBucket() {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    rateLimit: {
      ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
      resourceIp: { windowSeconds: 60, maxAttempts: 1 },
    },
  })
}

// Miniature router in the shape `orpc-base.ts` produces in production:
// a public procedure with the shared `resourceRateLimit` guard mounted
// via `.use()` after `.input()`/`.output()`.
const router = {
  ping: publicProc
    .route({ method: 'POST', path: '/ping' })
    .input(z.object({ msg: z.string().min(1).max(20) }))
    .output(z.object({ echoed: z.string() }))
    .use(resourceRateLimit)
    .handler(({ input }) => ({ echoed: input.msg })),
}

const handler = new RPCHandler(router)

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

    // The guard used to be the first statement of the handler — after
    // input validation. Invalid input must still see the validation
    // error, not 429, and never reach the counter.
    expect(res.status).not.toBe(429)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(__rateLimitKeysForTests()).toEqual([])
  })
})

// Miniature router in the shape the passkey controllers produce: a
// procedure with the shared `passkeyGuard` mounted via `.use()` after
// `.input()`/`.output()`.
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

/** Flip the real passkey gate by seeding the settings snapshot. */
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

// Both HTTP adapters consume `translateDomainError`; this suite pins the
// oRPC side of the converged contract — `ActionFailure` issues and
// headers are forwarded exactly like `DomainError` issues.
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
}

describe('domainErrorGuard translation', () => {
  it('forwards ActionFailure status, message, issues, and headers', async () => {
    const ctx = makePublicCtx()
    await expect(call(failingRouter.actionFailure, {}, { context: ctx })).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      status: 429,
      message: 'slow down',
      data: [{ message: 'dup' }],
    })
    expect(ctx.responseHeaders.get('Retry-After')).toBe('30')
  })

  it('keeps the DomainError code and forwards its issues', async () => {
    const ctx = makePublicCtx()
    await expect(call(failingRouter.domainError, {}, { context: ctx })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      status: 400,
      message: 'bad patch',
      data: [{ message: 'unknown key', path: ['seo'] }],
    })
  })
})

// Miniature router pinning the `commentTokenCookie` middleware contract:
// parse pre-handler, Set-Cookie write-back only when the handler assigns
// `refreshed`, and write-back survives a handler throw (finally).
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
    // Read-only procedures never schedule a write-back.
    expect(ctx.responseHeaders.get('Set-Cookie')).toBeNull()
  })

  it('writes the refreshed cookie back as Set-Cookie after the handler', async () => {
    const ctx = makePublicCtx()
    const res = await call(tokenRouter.refresh, {}, { context: ctx })
    expect(res).toEqual({ ok: true })
    const setCookie = ctx.responseHeaders.get('Set-Cookie')
    expect(setCookie).toContain('__comment_tokens=')
    // Round-trip: the serialized value parses back to the assigned cookie.
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
