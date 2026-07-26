import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

vi.mock('@/server/infra/rate-limit', () => ({
  readBucket: vi.fn(),
  tryKeyedRateLimit: vi.fn(),
}))

import { rateLimitByIp } from '@/server/http/middlewares/rate-limit'
import { readBucket, tryKeyedRateLimit } from '@/server/infra/rate-limit'

const readBucketMock = vi.mocked(readBucket)
const tryKeyedRateLimitMock = vi.mocked(tryKeyedRateLimit)

const SETTINGS_BUCKET = { windowSeconds: 60, maxAttempts: 3 }

function buildApp(...args: Parameters<typeof rateLimitByIp>) {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', { clientAddress: '203.0.113.7' } as unknown as Env['Variables']['requestContext'])
    await next()
  })
  app.get('/ping', rateLimitByIp(...args), (c) => c.text('pong'))
  return app
}

describe('rateLimitByIp middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    readBucketMock.mockReturnValue(SETTINGS_BUCKET)
    tryKeyedRateLimitMock.mockResolvedValue({ count: 1, exceeded: false })
  })

  it('passes through under the budget, keying the counter on the client IP', async () => {
    const res = await buildApp('feed', 'resourceIp').request('/ping')

    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toBe('pong')
    expect(readBucketMock).toHaveBeenCalledWith('resourceIp')
    expect(tryKeyedRateLimitMock).toHaveBeenCalledWith('rate-limit:feed:203.0.113.7', SETTINGS_BUCKET)
  })

  it('answers 429 with the default HTTPException shape when exceeded', async () => {
    tryKeyedRateLimitMock.mockResolvedValue({ count: 100, exceeded: true })

    const res = await buildApp('setupRestore', 'resourceIp').request('/ping')

    // Hono's default error handler renders the thrown HTTPException as a
    // plain-text message body — the perimeter `onError` in production
    // maps the same exception to the standard API error JSON.
    expect(res.status).toBe(429)
    await expect(res.text()).resolves.toBe('请求过于频繁，请稍后再试。')
  })

  it('answers 429 with the custom error body verbatim when exceeded', async () => {
    tryKeyedRateLimitMock.mockResolvedValue({ count: 100, exceeded: true })

    const res = await buildApp('feed', 'resourceIp', { errorBody: { error: 'Too many requests' } }).request('/ping')

    expect(res.status).toBe(429)
    expect(res.headers.get('Content-Type')).toContain('application/json')
    await expect(res.json()).resolves.toEqual({ error: 'Too many requests' })
  })

  it('accepts an explicit bucket object without reading the settings snapshot', async () => {
    const explicit = { windowSeconds: 3600, maxAttempts: 5 }

    const res = await buildApp('setupRestore', explicit).request('/ping')

    expect(res.status).toBe(200)
    expect(readBucketMock).not.toHaveBeenCalled()
    expect(tryKeyedRateLimitMock).toHaveBeenCalledWith('rate-limit:setupRestore:203.0.113.7', explicit)
  })
})
