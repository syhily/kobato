import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { onErrorHandler } from '@/server/http/errors'
import { representationRevisionsFor } from '@/shared/config/representation-scopes'

const REVISIONS = representationRevisionsFor(TEST_BLOG_SETTINGS_BUNDLE)

function createTestApp() {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', {
      clientAddress: '127.0.0.1',
      db: {},
      settings: TEST_BLOG_SETTINGS_BUNDLE,
      localization: {
        locale: 'zh-CN',
        timeZone: 'Asia/Shanghai',
        timeFormat: null,
        revision: 'boot-test:0000000001',
        revisions: REVISIONS,
      },
    } as never)
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
    vi.doMock('@/server/infra/cache/registry', () => ({
      through: vi.fn().mockResolvedValue(cached),
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
    // Revalidated, not max-age: a domain change must not be shadowed.
    expect(res.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(res.headers.get('ETag')).toMatch(/^"[0-9a-f]{32}"$/)
    await expect(res.text()).resolves.toBe(cached)
  })

  it('builds sitemap on cache miss from the pinned settings + sitemap revision', async () => {
    const built = '<urlset><url><loc>/hello</loc></url></urlset>'
    const through = vi.fn((_id: unknown, _params: unknown, loader: () => unknown) => loader())
    vi.doMock('@/server/infra/cache/registry', () => ({ through }))
    vi.doMock('@/server/infra/rate-limit', () => ({
      readBucket: vi.fn(() => ({ windowSeconds: 60, maxAttempts: 60 })),
      tryKeyedRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
    }))
    const buildSitemapXml = vi.fn().mockResolvedValue(built)
    vi.doMock('@/server/render/seo/sitemap', () => ({ buildSitemapXml }))

    const { sitemapRouter } = await import('@/server/http/resources/sitemap')
    const app = createTestApp()
    app.route('/', sitemapRouter)

    const res = await app.request('/sitemap.xml')
    expect(res.status).toBe(200)
    await expect(res.text()).resolves.toBe(built)
    expect(through).toHaveBeenCalledWith('sitemap', { settingsRevision: REVISIONS.sitemap }, expect.any(Function))
    expect(buildSitemapXml).toHaveBeenCalledWith({}, TEST_BLOG_SETTINGS_BUNDLE)
  })

  it('answers 304 on a matching If-None-Match without a body', async () => {
    const cached = '<urlset></urlset>'
    vi.doMock('@/server/infra/cache/registry', () => ({
      through: vi.fn().mockResolvedValue(cached),
    }))
    vi.doMock('@/server/infra/rate-limit', () => ({
      readBucket: vi.fn(() => ({ windowSeconds: 60, maxAttempts: 60 })),
      tryKeyedRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
    }))

    const { sitemapRouter } = await import('@/server/http/resources/sitemap')
    const app = createTestApp()
    app.route('/', sitemapRouter)

    const first = await app.request('/sitemap.xml')
    const etag = first.headers.get('ETag')!
    const cachedRes = await app.request('/sitemap.xml', { headers: { 'if-none-match': etag } })

    expect(cachedRes.status).toBe(304)
    expect(cachedRes.headers.get('ETag')).toBe(etag)
    expect(cachedRes.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(await cachedRes.text()).toBe('')
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
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'TOO_MANY_REQUESTS', message: '请求过于频繁，请稍后再试。' },
    })
  })
})
