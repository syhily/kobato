import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Env } from '@/server/http/context'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { rateLimitByIp } from '@/server/http/middlewares/rate-limit'
import { __rateLimitKeysForTests, __resetRateLimitsForTests } from '@/server/infra/rate-limit'

function buildApp(...args: Parameters<typeof rateLimitByIp>) {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', { clientAddress: '203.0.113.7' } as unknown as Env['Variables']['requestContext'])
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

  it('answers 429 with the custom error body verbatim when exceeded', async () => {
    seedSingleAttemptResourceBucket()
    const app = buildApp('feed', 'resourceIp', { errorBody: { error: 'Too many requests' } })
    expect((await app.request('/ping')).status).toBe(200)

    const res = await app.request('/ping')

    expect(res.status).toBe(429)
    expect(res.headers.get('Content-Type')).toContain('application/json')
    await expect(res.json()).resolves.toEqual({ error: 'Too many requests' })
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
