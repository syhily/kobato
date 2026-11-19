import type { Env } from '@kobato/server/http/hono-env.ts'

import { onErrorHandler } from '@kobato/server/http/errors.ts'
import { TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/server/tests/utils/blog-settings.ts'
import { representationRevisionsFor } from '@kobato/settings/representation-scopes.ts'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

  it('returns cached sitemap when available', { timeout: 30_000 }, async () => {
    const cached = '<urlset></urlset>'
    vi.doMock('@kobato/server/infra/cache/registry.ts', () => ({
      through: vi.fn().mockResolvedValue(cached),
    }))
    vi.doMock('@kobato/server/infra/rate-limit.ts', () => ({
      readBucket: vi.fn(() => ({ windowSeconds: 60, maxAttempts: 60 })),
      tryKeyedRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
    }))

    const { sitemapRouter } = await import('@kobato/server/http/resources/sitemap.ts')
    const app = createTestApp()
    app.route('/', sitemapRouter)

    const res = await app.request('/sitemap.xml')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/xml; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(res.headers.get('ETag')).toMatch(/^"[0-9a-f]{32}"$/)
    await expect(res.text()).resolves.toBe(cached)
  })

  it('builds sitemap on cache miss from the pinned settings + sitemap revision', async () => {
    const built = '<urlset><url><loc>/hello</loc></url></urlset>'
    const through = vi.fn((_id: unknown, _params: unknown, loader: () => unknown) => loader())
    vi.doMock('@kobato/server/infra/cache/registry.ts', () => ({ through }))
    vi.doMock('@kobato/server/infra/rate-limit.ts', () => ({
      readBucket: vi.fn(() => ({ windowSeconds: 60, maxAttempts: 60 })),
      tryKeyedRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
    }))
    const buildSitemapXml = vi.fn().mockResolvedValue(built)
    vi.doMock('@kobato/server/render/seo/sitemap.ts', () => ({ buildSitemapXml }))

    const { sitemapRouter } = await import('@kobato/server/http/resources/sitemap.ts')
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
    vi.doMock('@kobato/server/infra/cache/registry.ts', () => ({
      through: vi.fn().mockResolvedValue(cached),
    }))
    vi.doMock('@kobato/server/infra/rate-limit.ts', () => ({
      readBucket: vi.fn(() => ({ windowSeconds: 60, maxAttempts: 60 })),
      tryKeyedRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
    }))

    const { sitemapRouter } = await import('@kobato/server/http/resources/sitemap.ts')
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
    vi.doMock('@kobato/server/infra/rate-limit.ts', () => ({
      readBucket: vi.fn(() => ({ windowSeconds: 60, maxAttempts: 60 })),
      tryKeyedRateLimit: vi.fn().mockResolvedValue({ exceeded: true }),
    }))

    const { sitemapRouter } = await import('@kobato/server/http/resources/sitemap.ts')
    const app = createTestApp()
    app.route('/', sitemapRouter)

    const res = await app.request('/sitemap.xml')
    expect(res.status).toBe(429)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: 'TOO_MANY_REQUESTS', message: '请求过于频繁，请稍后再试。' },
    })
  })
})
