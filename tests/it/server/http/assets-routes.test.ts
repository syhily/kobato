import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import type { Env } from '@/server/http/context'
import type { BrandingObjectRef } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { getTestDb } from '#/_helpers/integration-db'
import { makeRequestContext } from '#/_helpers/request-context'

const { assetsRouter } = await import('@/server/http/resources/assets')

// The manifest/robots handlers read the REQUEST capture; mount the router
// behind the same projection the perimeter provides.
async function requestAssets(path: string, init?: RequestInit): Promise<Response> {
  const db = getTestDb()
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set(
      'requestContext',
      makeRequestContext({
        request: new Request(`http://localhost${path}`, init),
        db,
      }) as unknown as Env['Variables']['requestContext'],
    )
    await next()
  })
  app.route('/', assetsRouter)
  return app.request(path, init)
}

function ref(etag: string, contentType: string): BrandingObjectRef {
  // 'local': the real local backend has neither branding key in the test storage root, so
  // fetchBrandingObject genuinely returns null — no service-level mock needed.
  return { etag, contentType, size: 1024, updatedAt: '2024-01-01T00:00:00.000Z', driver: 'local' }
}

describe('assetsRouter static paths', () => {
  it('returns 200 for /favicon.svg with ETag + revalidate cache headers', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await requestAssets('/favicon.svg')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600, must-revalidate')
    expect(res.headers.get('ETag')).toMatch(/^"[a-f0-9]{64}"$/)
  })

  it('returns 304 when If-None-Match matches', async () => {
    setBlogSettingsBundleForTests(null)
    const first = await requestAssets('/favicon.svg')
    const etag = first.headers.get('ETag')!
    const second = await requestAssets('/favicon.svg', { headers: { 'If-None-Match': etag } })
    expect(second.status).toBe(304)
    expect(second.headers.get('ETag')).toBe(etag)
    expect(await second.text()).toBe('')
  })

  it('returns 200 for /favicon.ico (bundled default)', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await requestAssets('/favicon.ico')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/x-icon')
  })

  it('returns 200 for /apple-touch-icon.png', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await requestAssets('/apple-touch-icon.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('returns 200 for /logo.svg', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await requestAssets('/logo.svg')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
  })

  it('returns 200 for /logo-dark.svg', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await requestAssets('/logo-dark.svg')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
  })

  it('returns 200 for /images/icon-192.png', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await requestAssets('/images/icon-192.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('returns 200 for /images/icon-512.png', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await requestAssets('/images/icon-512.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('falls back to default when the configured ref has no stored object', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
        branding: { faviconSvg: ref('cafe', 'image/svg+xml') },
      },
    })
    const res = await requestAssets('/favicon.svg')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
    // fetchBrandingObject returns null (object missing on the local backend) →
    // the bundled default is served, whose etag is sha256 hex (not "cafe").
    expect(res.headers.get('ETag')).toMatch(/^"[a-f0-9]{64}"$/)
  })

  it('returns 404 for unregistered paths', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await requestAssets('/images/unknown.png')
    expect(res.status).toBe(404)
  })
})

describe('assetsRouter manifest', () => {
  it('returns a valid, localized webmanifest with revalidating cache headers', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, title: 'Test Blog' },
    })
    const res = await requestAssets('/manifest.webmanifest')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('application/json')
    expect(res.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(res.headers.get('Content-Language')).toBe('zh-CN')
    const json = await res.json()
    expect(json.name).toBe('Test Blog')
    expect(json.lang).toBe('zh-CN')
    expect(json.icons).toHaveLength(2)
    expect(json.display).toBe('standalone')
  })

  it('hashes the EXACT serialized bytes for the ETag (no object-hash / body drift)', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, title: 'Test Blog' },
    })
    const res = await requestAssets('/manifest.webmanifest')
    const body = await res.text()

    // Recompute over the received bytes — not a re-serialized object.
    const { createHash } = await import('node:crypto')
    const expected = `"${createHash('sha1').update(body).digest('hex').slice(0, 32)}"`
    expect(res.headers.get('ETag')).toBe(expected)
    expect(JSON.parse(body).lang).toBe('zh-CN')
  })

  it('answers 304 on a matching If-None-Match with the current language heads', async () => {
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    const first = await requestAssets('/manifest.webmanifest')
    const etag = first.headers.get('ETag')!
    await first.text()

    const cached = await requestAssets('/manifest.webmanifest', {
      headers: { 'If-None-Match': etag },
    })

    expect(cached.status).toBe(304)
    expect(cached.headers.get('ETag')).toBe(etag)
    expect(cached.headers.get('Cache-Control')).toBe('public, no-cache')
    expect(cached.headers.get('Content-Language')).toBe('zh-CN')
    expect(await cached.text()).toBe('')
  })

  it.each(['en-US', 'zh-CN', 'zh-TW', 'zh-HK'] as const)(
    'carries the %s UI language in `lang`, Content-Language and a distinct ETag',
    async (locale) => {
      setBlogSettingsBundleForTests({
        ...TEST_BLOG_SETTINGS_BUNDLE,
        siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, locale },
      })
      try {
        const res = await requestAssets('/manifest.webmanifest')
        expect(res.headers.get('Content-Language')).toBe(locale)
        const json = await res.json()
        expect(json.lang).toBe(locale)
        expect(res.headers.get('ETag')).toMatch(/^"[0-9a-f]{32}"$/)
      } finally {
        setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
      }
    },
  )

  it('falls back to a default name when the bundle is null (early boot)', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await requestAssets('/manifest.webmanifest')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.name).toBe('Site')
    expect(json.lang).toBe('zh-CN')
  })
})
describe('assetsRouter robots.txt', () => {
  it('returns default robots.txt when no custom branding', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, website: 'https://example.com' },
      assets: { ...TEST_BLOG_SETTINGS_BUNDLE.assets!, branding: {} },
    })

    const res = await requestAssets('/robots.txt')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('User-agent: *')
    expect(text).toContain('Sitemap: https://example.com/sitemap.xml')
  })

  it('returns custom robots.txt when branding override exists', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
        branding: { robotsTxt: 'User-agent: *\nDisallow: /' },
      },
    })

    const res = await requestAssets('/robots.txt')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toBe('User-agent: *\nDisallow: /')
  })

  it('falls back to a safe minimum when the bundle is null', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await requestAssets('/robots.txt')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toBe('User-agent: *\nAllow: /\n')
  })
})
