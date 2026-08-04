import type { Env } from '@kobato/server/http/context'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'

import { rateLimitByIp } from '@kobato/server/http/middlewares/rate-limit'
import { __rateLimitKeysForTests, __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'

function buildApp(...args: Parameters<typeof rateLimitByIp>) {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', { clientAddress: '203.0.113.7' } as unknown as Env['Variables']['requestContext'])
    await next()
  })
  app.get('/ping', rateLimitByIp(...args), (c) => c.text('pong'))
  return app
}

/** Same shape as buildApp, with a caller-picked client address. */
function buildAppWithAddress(clientAddress: string, ...args: Parameters<typeof rateLimitByIp>) {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', { clientAddress } as unknown as Env['Variables']['requestContext'])
    await next()
  })
  app.get('/ping', rateLimitByIp(...args), (c) => c.text('pong'))
  return app
}

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

describe('rateLimitByIp middleware', () => {
  beforeEach(() => {
    __resetRateLimitsForTests()
  })

  it('passes through under the budget, keying the counter on the client IP', async () => {
    const res = await buildApp('feed', 'resourceIp').request('/ping')

    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toBe('pong')
    expect(__rateLimitKeysForTests()).toEqual(['rate-limit:feed:203.0.113.7'])
  })

  // V3-09: when the peer IP is unknown but the socket port is known, the
  // request-context middleware keys the address on `port:<n>` — the bucket
  // must follow that per-connection discriminator instead of the shared
  // 'unknown' bucket.
  it('keys the bucket on the per-connection port when the peer IP is unknown', async () => {
    const res = await buildAppWithAddress('port:43210', 'feed', 'resourceIp').request('/ping')

    expect(res.status).toBe(200)
    expect(__rateLimitKeysForTests()).toEqual(['rate-limit:feed:port:43210'])
  })

  it('falls back to the shared unknown bucket when neither IP nor port is known', async () => {
    const res = await buildAppWithAddress('unknown', 'feed', 'resourceIp').request('/ping')

    expect(res.status).toBe(200)
    expect(__rateLimitKeysForTests()).toEqual(['rate-limit:feed:unknown'])
  })

  it('answers 429 with the default HTTPException shape when exceeded', async () => {
    seedSingleAttemptResourceBucket()
    const app = buildApp('setupRestore', 'resourceIp')
    expect((await app.request('/ping')).status).toBe(200)

    const res = await app.request('/ping')

    // Hono's default error handler renders the thrown HTTPException as a
    // plain-text message body — the perimeter `onError` in production
    // maps the same exception to the standard API error JSON.
    expect(res.status).toBe(429)
    await expect(res.text()).resolves.toBe('请求过于频繁，请稍后再试。')
  })

  it('accepts an explicit bucket object that governs instead of the settings snapshot', async () => {
    // The settings bucket stays generous; the explicit maxAttempts: 1
    // bucket is what trips the second request.
    const app = buildApp('setupRestore', { windowSeconds: 3600, maxAttempts: 1 })

    expect((await app.request('/ping')).status).toBe(200)
    expect((await app.request('/ping')).status).toBe(429)
    expect(__rateLimitKeysForTests()).toEqual(['rate-limit:setupRestore:203.0.113.7'])
  })
})
