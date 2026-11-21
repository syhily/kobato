import type { Env } from '@kobato/server/http/hono-env.ts'
import type { BlogSettingsBundle } from '@kobato/settings/types.ts'

import { DEFAULT_SVG_ETAG } from '@kobato/server/assets/defaults.ts'
import { setBlogSettingsBundleForTests, TEST_BLOG_SETTINGS_BUNDLE } from '@kobato/settings/tests/utils/blog-settings.ts'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'

function requestContextFor(settings: BlogSettingsBundle | null, locale: 'zh-CN' | 'zh-TW' = 'zh-CN') {
  return {
    db: {},
    settings,
    localization: { locale, timeZone: 'Asia/Shanghai', timeFormat: null, revision: 'test-boot:0000000001' },
  } as unknown as Env['Variables']['requestContext']
}

async function buildApp(settings: BlogSettingsBundle | null = TEST_BLOG_SETTINGS_BUNDLE) {
  const { assetsRouter } = await import('@kobato/server/http/resources/assets.ts')
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', requestContextFor(settings))
    await next()
  })
  app.route('/', assetsRouter)
  return app
}

describe('assetsRouter', () => {
  beforeEach(() => {
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  })

  it('returns 404 when the path maps to no asset route', async () => {
    const app = await buildApp()
    const res = await app.request('/nope.svg')
    expect(res.status).toBe(404)
  })

  it('returns the default logo asset bytes with the default etag', async () => {
    const app = await buildApp()

    const res = await app.request('/logo.svg')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
    expect(res.headers.get('ETag')).toBe(`"${DEFAULT_SVG_ETAG.logoSvg}"`)
  })

  it('returns 304 on matching if-none-match', async () => {
    const app = await buildApp()

    const res = await app.request('/logo.svg', { headers: { 'if-none-match': `"${DEFAULT_SVG_ETAG.logoSvg}"` } })
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
