import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'

describe('assetsRouter', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('@/shared/config/getters', () => ({
      getBlogSettingsBundleSync: vi.fn().mockReturnValue(TEST_BLOG_SETTINGS_BUNDLE),
    }))
  })

  async function buildApp() {
    vi.doMock('@/server/domains/assets/services/routes', () => ({
      ASSET_ROUTES: { '/logo.svg': 'logo' },
      resolveSiteAsset: vi.fn(),
    }))

    const { assetsRouter } = await import('@/server/http/resources/assets')
    const app = new Hono<Env>()
    app.route('/', assetsRouter)
    return app
  }

  it('returns 404 when asset is not resolved', async () => {
    const app = await buildApp()
    const res = await app.request('/logo.svg')
    expect(res.status).toBe(404)
  })

  it('returns asset bytes with etag', async () => {
    vi.doMock('@/server/domains/assets/services/routes', () => ({
      ASSET_ROUTES: { '/logo.svg': 'logo' },
      resolveSiteAsset: vi.fn().mockResolvedValue({
        content: Buffer.from('<svg></svg>'),
        contentType: 'image/svg+xml',
        etag: 'abc',
      }),
    }))

    const { assetsRouter } = await import('@/server/http/resources/assets')
    const app = new Hono<Env>()
    app.route('/', assetsRouter)

    const res = await app.request('/logo.svg')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
    expect(res.headers.get('ETag')).toBe('"abc"')
  })

  it('returns 304 on matching if-none-match', async () => {
    vi.doMock('@/server/domains/assets/services/routes', () => ({
      ASSET_ROUTES: { '/logo.svg': 'logo' },
      resolveSiteAsset: vi.fn().mockResolvedValue({
        content: Buffer.from('<svg></svg>'),
        contentType: 'image/svg+xml',
        etag: 'abc',
      }),
    }))

    const { assetsRouter } = await import('@/server/http/resources/assets')
    const app = new Hono<Env>()
    app.route('/', assetsRouter)

    const res = await app.request('/logo.svg', { headers: { 'if-none-match': '"abc"' } })
    expect(res.status).toBe(304)
  })

  it('serves webmanifest with site title', async () => {
    const { assetsRouter } = await import('@/server/http/resources/assets')
    const app = new Hono<Env>()
    app.route('/', assetsRouter)

    const res = await app.request('/manifest.webmanifest')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe(TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!.title)
  })

  it('serves robots.txt with sitemap link', async () => {
    const { assetsRouter } = await import('@/server/http/resources/assets')
    const app = new Hono<Env>()
    app.route('/', assetsRouter)

    const res = await app.request('/robots.txt')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Sitemap:')
    expect(body).toContain('/sitemap.xml')
  })
})
