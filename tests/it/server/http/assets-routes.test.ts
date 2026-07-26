import { describe, expect, it, vi } from 'vitest'

import type { BlogSettingsBundle, BrandingObjectRef } from '@/shared/config/types'

vi.mock('@/shared/config/getters', () => ({
  getBlogSettingsBundleSync: vi.fn(),
  requireBlogSettingsSection: vi.fn((section: string) => {
    if (section === 'siteIdentity') {
      return { title: 'Test Blog', website: 'https://example.com' }
    }
    return {}
  }),
}))
vi.mock('@/server/domains/assets/services/storage', async (importActual) => {
  const actual = (await importActual()) as typeof import('@/server/domains/assets/services/storage')
  return {
    ...actual,
    fetchBrandingObject: vi.fn().mockResolvedValue(null),
  }
})

const { getBlogSettingsBundleSync } = await import('@/shared/config/getters')
const { assetsRouter } = await import('@/server/http/resources/assets')

function bundleWith(overrides: Partial<BlogSettingsBundle> = {}): BlogSettingsBundle {
  return overrides as unknown as BlogSettingsBundle
}

function ref(etag: string, contentType: string): BrandingObjectRef {
  return { etag, contentType, size: 1024, updatedAt: '2024-01-01T00:00:00.000Z', driver: 's3' }
}

describe('assetsRouter static paths', () => {
  it('returns 200 for /favicon.svg with ETag + revalidate cache headers', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(null)
    const res = await assetsRouter.request('/favicon.svg')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600, must-revalidate')
    expect(res.headers.get('ETag')).toMatch(/^"[a-f0-9]{64}"$/)
  })

  it('returns 304 when If-None-Match matches', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(null)
    const first = await assetsRouter.request('/favicon.svg')
    const etag = first.headers.get('ETag')!
    const second = await assetsRouter.request('/favicon.svg', { headers: { 'If-None-Match': etag } })
    expect(second.status).toBe(304)
    expect(second.headers.get('ETag')).toBe(etag)
    expect(await second.text()).toBe('')
  })

  it('returns 200 for /favicon.ico (bundled default)', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(null)
    const res = await assetsRouter.request('/favicon.ico')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/x-icon')
  })

  it('returns 200 for /apple-touch-icon.png', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(null)
    const res = await assetsRouter.request('/apple-touch-icon.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('returns 200 for /logo.svg', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(null)
    const res = await assetsRouter.request('/logo.svg')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
  })

  it('returns 200 for /logo-dark.svg', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(null)
    const res = await assetsRouter.request('/logo-dark.svg')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
  })

  it('returns 200 for /images/icon-192.png', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(null)
    const res = await assetsRouter.request('/images/icon-192.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('returns 200 for /images/icon-512.png', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(null)
    const res = await assetsRouter.request('/images/icon-512.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  it('falls back to default when S3 fetch fails for a configured ref', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(
      bundleWith({
        assets: {
          branding: { faviconSvg: ref('cafe', 'image/svg+xml') },
        } as unknown as BlogSettingsBundle['assets'],
      }),
    )
    const res = await assetsRouter.request('/favicon.svg')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
    // fetchBrandingObject returns null → server falls back to bundled
    // default whose etag is sha256 hex (not "cafe").
    expect(res.headers.get('ETag')).toMatch(/^"[a-f0-9]{64}"$/)
  })

  it('returns 404 for unregistered paths', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(null)
    const res = await assetsRouter.request('/images/unknown.png')
    expect(res.status).toBe(404)
  })
})

describe('assetsRouter manifest', () => {
  it('returns a valid webmanifest using site identity title', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(
      bundleWith({ siteIdentity: { title: 'Test Blog' } as unknown as BlogSettingsBundle['siteIdentity'] }),
    )
    const res = await assetsRouter.request('/manifest.webmanifest')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('application/json')
    const json = await res.json()
    expect(json.name).toBe('Test Blog')
    expect(json.icons).toHaveLength(2)
    expect(json.display).toBe('standalone')
  })

  it('falls back to a default name when the bundle is null (early boot)', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(null)
    const res = await assetsRouter.request('/manifest.webmanifest')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.name).toBe('Site')
  })
})

describe('assetsRouter robots.txt', () => {
  it('returns default robots.txt when no custom branding', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(
      bundleWith({
        siteIdentity: { website: 'https://example.com' } as unknown as BlogSettingsBundle['siteIdentity'],
        assets: { branding: {} } as unknown as BlogSettingsBundle['assets'],
      }),
    )

    const res = await assetsRouter.request('/robots.txt')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('User-agent: *')
    expect(text).toContain('Sitemap: https://example.com/sitemap.xml')
  })

  it('returns custom robots.txt when branding override exists', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(
      bundleWith({
        assets: {
          branding: { robotsTxt: 'User-agent: *\nDisallow: /' },
        } as unknown as BlogSettingsBundle['assets'],
      }),
    )

    const res = await assetsRouter.request('/robots.txt')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toBe('User-agent: *\nDisallow: /')
  })

  it('falls back to a safe minimum when the bundle is null', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(null)
    const res = await assetsRouter.request('/robots.txt')
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toBe('User-agent: *\nAllow: /\n')
  })
})
