import type { BrandingObjectRef } from '@kobato/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'

import { describe, expect, it } from 'vitest'

const { assetsRouter } = await import('@kobato/server/http/resources/assets')

function ref(etag: string, contentType: string): BrandingObjectRef {
  // 'local': the real local backend misses the branding key in the test
  // storage root (and the legacy key too), so fetchBrandingObject genuinely
  // returns null — no service-level mock needed.
  return { etag, contentType, size: 1024, updatedAt: '2024-01-01T00:00:00.000Z', driver: 'local' }
}

describe('assetsRouter static paths', () => {
  it('returns 200 for /favicon.svg with ETag + revalidate cache headers', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await assetsRouter.request('/favicon.svg')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600, must-revalidate')
    expect(res.headers.get('ETag')).toMatch(/^"[a-f0-9]{64}"$/)
  })

  it('returns 304 when If-None-Match matches', async () => {
    setBlogSettingsBundleForTests(null)
    const first = await assetsRouter.request('/favicon.svg')
    const etag = first.headers.get('ETag')!
    const second = await assetsRouter.request('/favicon.svg', { headers: { 'If-None-Match': etag } })
    expect(second.status).toBe(304)
    expect(second.headers.get('ETag')).toBe(etag)
    expect(await second.text()).toBe('')
  })

  it('returns 200 for /favicon.ico (bundled default)', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await assetsRouter.request('/favicon.ico')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/x-icon')
  })

  it('returns 200 for /apple-touch-icon.png', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await assetsRouter.request('/apple-touch-icon.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('returns 200 for /logo.svg', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await assetsRouter.request('/logo.svg')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
  })

  it('returns 200 for /logo-dark.svg', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await assetsRouter.request('/logo-dark.svg')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
  })

  it('returns 200 for /images/icon-192.png', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await assetsRouter.request('/images/icon-192.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('returns 200 for /images/icon-512.png', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await assetsRouter.request('/images/icon-512.png')
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
    const res = await assetsRouter.request('/favicon.svg')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
    // fetchBrandingObject returns null (object missing on the local
    // backend) → server falls back to bundled default whose etag is
    // sha256 hex (not "cafe").
    expect(res.headers.get('ETag')).toMatch(/^"[a-f0-9]{64}"$/)
  })

  it('returns 404 for unregistered paths', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await assetsRouter.request('/images/unknown.png')
    expect(res.status).toBe(404)
  })
})

describe('assetsRouter manifest', () => {
  it('returns a valid webmanifest using site identity title', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, title: 'Test Blog' },
    })
    const res = await assetsRouter.request('/manifest.webmanifest')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('application/json')
    const json = await res.json()
    expect(json.name).toBe('Test Blog')
    expect(json.icons).toHaveLength(2)
    expect(json.display).toBe('standalone')
  })

  it('falls back to a default name when the bundle is null (early boot)', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await assetsRouter.request('/manifest.webmanifest')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.name).toBe('Site')
  })
})
describe('assetsRouter robots.txt', () => {
  it('returns default robots.txt when no custom branding', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      siteIdentity: { ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!, website: 'https://example.com' },
      assets: { ...TEST_BLOG_SETTINGS_BUNDLE.assets!, branding: {} },
    })

    const res = await assetsRouter.request('/robots.txt')
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

    const res = await assetsRouter.request('/robots.txt')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toBe('User-agent: *\nDisallow: /')
  })

  it('falls back to a safe minimum when the bundle is null', async () => {
    setBlogSettingsBundleForTests(null)
    const res = await assetsRouter.request('/robots.txt')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toBe('User-agent: *\nAllow: /\n')
  })
})
