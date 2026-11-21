import type { Env } from '@kobato/server/http/hono-env.ts'

import { rateLimitByIp } from '@kobato/server/http/middlewares/rate-limit.ts'
import { __rateLimitKeysForTests, __resetRateLimitsForTests } from '@kobato/server/infra/rate-limit.ts'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings.ts'
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

function buildAppWithAddress(clientAddress: string, ...args: Parameters<typeof rateLimitByIp>) {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', { clientAddress } as unknown as Env['Variables']['requestContext'])
    await next()
  })
  app.get('/ping', rateLimitByIp(...args), (c) => c.text('pong'))
  return app
}

function seedSingleAttemptResourceBucket() {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    rateLimit: {
      ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
      resource: { windowSeconds: 60, maxAttempts: 1 },
    },
  })
}

describe('rateLimitByIp middleware', () => {
  beforeEach(() => {
    __resetRateLimitsForTests()
  })

  it('passes through under the budget, keying the counter on the client IP', async () => {
    const res = await buildApp('feed', 'resource').request('/ping')

    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toBe('pong')
    expect(__rateLimitKeysForTests()).toEqual(['rate-limit:feed:203.0.113.7'])
  })

  it('keys the bucket on the per-connection port when the peer IP is unknown', async () => {
    const res = await buildAppWithAddress('port:43210', 'feed', 'resource').request('/ping')

    expect(res.status).toBe(200)
    expect(__rateLimitKeysForTests()).toEqual(['rate-limit:feed:port:43210'])
  })

  it('falls back to the shared unknown bucket when neither IP nor port is known', async () => {
    const res = await buildAppWithAddress('unknown', 'feed', 'resource').request('/ping')

    expect(res.status).toBe(200)
    expect(__rateLimitKeysForTests()).toEqual(['rate-limit:feed:unknown'])
  })

  it('answers 429 with the default HTTPException shape when exceeded', async () => {
    seedSingleAttemptResourceBucket()
    const app = buildApp('setupRestore', 'resource')
    expect((await app.request('/ping')).status).toBe(200)

    const res = await app.request('/ping')

    expect(res.status).toBe(429)
    await expect(res.text()).resolves.toBe('Too many requests. Please try again later.')
  })

  it('accepts an explicit bucket object that governs instead of the settings snapshot', async () => {
    const app = buildApp('setupRestore', { windowSeconds: 3600, maxAttempts: 1 })

    expect((await app.request('/ping')).status).toBe(200)
    expect((await app.request('/ping')).status).toBe(429)
    expect(__rateLimitKeysForTests()).toEqual(['rate-limit:setupRestore:203.0.113.7'])
  })
})
