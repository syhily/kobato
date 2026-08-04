import type { Env } from '@kobato/server/http/context'

import { onErrorHandler } from '@kobato/server/http/errors'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function createTestApp() {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', { clientAddress: '127.0.0.1', db: {} } as never)
    await next()
  })
  app.onError(onErrorHandler)
  return app
}

describe('sitemapRouter', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  // The first cold import of the module graph can exceed the default 10s
  // timeout when the whole suite saturates the transform queue (pre-commit).
  it('returns cached sitemap when available', { timeout: 30_000 }, async () => {
    const cached = '<urlset></urlset>'
    vi.doMock('@kobato/server/infra/cache/registry', () => ({
      through: vi.fn().mockResolvedValue(cached),
    }))
    vi.doMock('@kobato/server/infra/rate-limit', () => ({
      readBucket: vi.fn(() => ({ windowSeconds: 60, maxAttempts: 60 })),
      tryKeyedRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
    }))

    const { sitemapRouter } = await import('@kobato/server/http/resources/sitemap')
    const app = createTestApp()
    app.route('/', sitemapRouter)

    const res = await app.request('/sitemap.xml')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/xml; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600')
    await expect(res.text()).resolves.toBe(cached)
  })

  it('builds sitemap on cache miss', async () => {
    const built = '<urlset><url><loc>/hello</loc></url></urlset>'
    const through = vi.fn((_db: unknown, _id: unknown, _params: unknown, loader: () => unknown) => loader())
    vi.doMock('@kobato/server/infra/cache/registry', () => ({ through }))
    vi.doMock('@kobato/server/infra/rate-limit', () => ({
      readBucket: vi.fn(() => ({ windowSeconds: 60, maxAttempts: 60 })),
      tryKeyedRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
    }))
    vi.doMock('@kobato/server/render/seo/sitemap', () => ({
      buildSitemapXml: vi.fn().mockResolvedValue(built),
    }))

    const { sitemapRouter } = await import('@kobato/server/http/resources/sitemap')
    const app = createTestApp()
    app.route('/', sitemapRouter)

    const res = await app.request('/sitemap.xml')
    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toBe(built)
    expect(through).toHaveBeenCalledWith({}, 'sitemap', {}, expect.any(Function))
  })

  it('returns 429 when rate limit exceeded', async () => {
    vi.doMock('@kobato/server/infra/rate-limit', () => ({
      readBucket: vi.fn(() => ({ windowSeconds: 60, maxAttempts: 60 })),
      tryKeyedRateLimit: vi.fn().mockResolvedValue({ exceeded: true }),
    }))

    const { sitemapRouter } = await import('@kobato/server/http/resources/sitemap')
    const app = createTestApp()
    app.route('/', sitemapRouter)

    const res = await app.request('/sitemap.xml')
    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toEqual({ error: { message: '请求过于频繁，请稍后再试。' } })
  })
})
