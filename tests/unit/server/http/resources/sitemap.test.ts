import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

function createTestApp() {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('clientAddress' as never, '127.0.0.1' as never)
    c.set('db' as never, {} as never)
    await next()
  })
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
    vi.doMock('@/server/infra/cache/sitemap-cache', () => ({
      sitemapCache: {
        get: vi.fn().mockResolvedValue(cached),
        set: vi.fn(),
      },
    }))
    vi.doMock('@/server/infra/rate-limit', () => ({
      readBucket: vi.fn(() => ({ windowSeconds: 60, maxAttempts: 60 })),
      tryKeyedRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
    }))

    const { sitemapRouter } = await import('@/server/http/resources/sitemap')
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
    vi.doMock('@/server/infra/cache/sitemap-cache', () => ({
      sitemapCache: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      },
    }))
    vi.doMock('@/server/infra/rate-limit', () => ({
      readBucket: vi.fn(() => ({ windowSeconds: 60, maxAttempts: 60 })),
      tryKeyedRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
    }))
    vi.doMock('@/server/render/seo/sitemap', () => ({
      buildSitemapXml: vi.fn().mockResolvedValue(built),
    }))

    const { sitemapRouter } = await import('@/server/http/resources/sitemap')
    const app = createTestApp()
    app.route('/', sitemapRouter)

    const res = await app.request('/sitemap.xml')
    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toBe(built)
  })

  it('returns 429 when rate limit exceeded', async () => {
    vi.doMock('@/server/infra/rate-limit', () => ({
      readBucket: vi.fn(() => ({ windowSeconds: 60, maxAttempts: 60 })),
      tryKeyedRateLimit: vi.fn().mockResolvedValue({ exceeded: true }),
    }))

    const { sitemapRouter } = await import('@/server/http/resources/sitemap')
    const app = createTestApp()
    app.route('/', sitemapRouter)

    const res = await app.request('/sitemap.xml')
    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toEqual({ error: 'Too many requests' })
  })
})
