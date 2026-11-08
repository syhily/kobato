import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Env } from '@/server/http/context'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'

// The manifest/robots handlers read the REQUEST's pinned snapshot — mount a
// request-context stub the way the perimeter would.
function requestContextFor(settings: BlogSettingsBundle | null, locale: 'zh-CN' | 'zh-TW' = 'zh-CN') {
  return {
    db: {},
    settings,
    localization: { locale, timeZone: 'Asia/Shanghai', timeFormat: null, revision: 'test-boot:0000000001' },
  } as unknown as Env['Variables']['requestContext']
}

describe('assetsRouter', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  async function buildApp(settings: BlogSettingsBundle | null = TEST_BLOG_SETTINGS_BUNDLE) {
    vi.doMock('@/server/domains/assets/services/routes', () => ({
      ASSET_ROUTES: { '/logo.svg': 'logo' },
      resolveSiteAsset: vi.fn(),
    }))

    const { assetsRouter } = await import('@/server/http/resources/assets')
    const app = new Hono<Env>()
    app.use('*', async (c, next) => {
      c.set('requestContext', requestContextFor(settings))
      await next()
    })
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
    app.use('*', async (c, next) => {
      c.set('requestContext', requestContextFor(TEST_BLOG_SETTINGS_BUNDLE))
      await next()
    })
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
    app.use('*', async (c, next) => {
      c.set('requestContext', requestContextFor(TEST_BLOG_SETTINGS_BUNDLE))
      await next()
    })
    app.route('/', assetsRouter)

    const res = await app.request('/logo.svg', { headers: { 'if-none-match': '"abc"' } })
    expect(res.status).toBe(304)
  })

  it('serves webmanifest from the REQUEST-pinned settings snapshot', async () => {
    const pinned: BlogSettingsBundle = {
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, title: 'Pinned Title' },
    }
    const app = await buildApp(pinned)

    const res = await app.request('/manifest.webmanifest')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { name: string; short_name: string }
    expect(body.name).toBe('Pinned Title')
    expect(body.short_name).toBe('Pinned Title')
  })

  it('falls back to the hard-coded name pre-install', async () => {
    const app = await buildApp(null)

    const res = await app.request('/manifest.webmanifest')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { name: string }
    expect(body.name).toBe('Site')
  })

  it('serves robots.txt from the REQUEST-pinned site origin', async () => {
    const pinned: BlogSettingsBundle = {
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, website: 'https://pinned.example.com' },
    }
    const app = await buildApp(pinned)

    const res = await app.request('/robots.txt')
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('Sitemap: https://pinned.example.com/sitemap.xml')
  })
})
