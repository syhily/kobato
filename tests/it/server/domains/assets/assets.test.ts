import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BrandingObjectRef, SiteAssetBranding } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'

vi.mock('@/server/domains/assets/services/storage', async (importActual) => {
  const actual = (await importActual()) as typeof import('@/server/domains/assets/services/storage')
  return {
    ...actual,
    fetchBrandingObject: vi.fn(),
  }
})

const { fetchBrandingObject } = await import('@/server/domains/assets/services/storage')
const { resolveSiteAsset } = await import('@/server/domains/assets/services/routes')

function seedBranding(branding: SiteAssetBranding): void {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    assets: { ...TEST_BLOG_SETTINGS_BUNDLE.assets!, branding },
  })
}

function ref(etag: string, contentType: string, bytes: number): BrandingObjectRef {
  return { etag, contentType, size: bytes, updatedAt: '2024-01-01T00:00:00.000Z', driver: 's3' }
}

describe('resolveSiteAsset', () => {
  beforeEach(() => {
    seedBranding({})
    vi.mocked(fetchBrandingObject).mockReset()
  })

  it('returns null for unknown paths', async () => {
    const result = await resolveSiteAsset('/unknown.png')
    expect(result).toBeNull()
  })

  it('serves the custom SVG fetched from S3 when an ObjectRef is configured', async () => {
    seedBranding({ faviconSvg: ref('etag-svg', 'image/svg+xml', 42) })
    vi.mocked(fetchBrandingObject).mockResolvedValue(Buffer.from('<svg>custom</svg>', 'utf8'))

    const result = await resolveSiteAsset('/favicon.svg')
    expect(result).not.toBeNull()
    expect(result!.contentType).toBe('image/svg+xml')
    expect(result!.etag).toBe('etag-svg')
    expect(result!.content.toString('utf8')).toBe('<svg>custom</svg>')
  })

  it('serves the custom binary fetched from S3 when an ObjectRef is configured', async () => {
    seedBranding({ appleTouchIcon: ref('etag-png', 'image/png', 99) })
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    vi.mocked(fetchBrandingObject).mockResolvedValue(png)

    const result = await resolveSiteAsset('/apple-touch-icon.png')
    expect(result).not.toBeNull()
    expect(result!.contentType).toBe('image/png')
    expect(result!.etag).toBe('etag-png')
    expect(result!.content.equals(png)).toBe(true)
  })

  it('falls back to default SVG when no ObjectRef configured', async () => {
    seedBranding({})

    const result = await resolveSiteAsset('/favicon.svg')
    expect(result).not.toBeNull()
    expect(result!.contentType).toBe('image/svg+xml')
    expect(result!.content.length).toBeGreaterThan(0)
    expect(result!.etag).toMatch(/^[a-f0-9]{64}$/)
  })

  it('falls back to default binary when no ObjectRef configured', async () => {
    seedBranding({})

    const result = await resolveSiteAsset('/images/icon-192.png')
    expect(result).not.toBeNull()
    expect(result!.contentType).toBe('image/png')
    expect(result!.content.length).toBeGreaterThan(0)
    expect(result!.etag).toMatch(/^[a-f0-9]{64}$/)
  })

  it('falls back to default when S3 fetch returns null', async () => {
    seedBranding({ logoSvg: ref('etag-broken', 'image/svg+xml', 7) })
    vi.mocked(fetchBrandingObject).mockResolvedValue(null)

    const result = await resolveSiteAsset('/logo.svg')
    expect(result).not.toBeNull()
    expect(result!.content.length).toBeGreaterThan(0)
    expect(result!.etag).not.toBe('etag-broken')
  })

  it('falls back to default when assets section is missing', async () => {
    setBlogSettingsBundleForTests({ ...TEST_BLOG_SETTINGS_BUNDLE, assets: null })

    const result = await resolveSiteAsset('/logo.svg')
    expect(result).not.toBeNull()
    expect(result!.content.length).toBeGreaterThan(0)
  })

  it('returns null for /robots.txt (handled by the route, not resolveSiteAsset)', async () => {
    const result = await resolveSiteAsset('/robots.txt')
    expect(result).toBeNull()
  })
})
