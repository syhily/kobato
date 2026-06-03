import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlogSettingsBundle, BrandingObjectRef } from '@/shared/config/types'

vi.mock('@/shared/config/getters', () => ({
  getBlogSettingsBundleSync: vi.fn(),
}))
vi.mock('@/server/domains/assets/repos/storage', async (importActual) => {
  const actual = (await importActual()) as typeof import('@/server/domains/assets/repos/storage')
  return {
    ...actual,
    fetchBrandingObject: vi.fn(),
  }
})

const { getBlogSettingsBundleSync } = await import('@/shared/config/getters')
const { fetchBrandingObject } = await import('@/server/domains/assets/repos/storage')
const { resolveSiteAsset } = await import('@/server/domains/assets/services/routes')

function bundleWith(branding: Record<string, unknown>): BlogSettingsBundle {
  return { assets: { branding } } as unknown as BlogSettingsBundle
}

function ref(etag: string, contentType: string, bytes: number): BrandingObjectRef {
  return { etag, contentType, size: bytes, updatedAt: '2024-01-01T00:00:00.000Z' }
}

describe('resolveSiteAsset', () => {
  beforeEach(() => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(bundleWith({}))
    vi.mocked(fetchBrandingObject).mockReset()
  })

  it('returns null for unknown paths', async () => {
    const result = await resolveSiteAsset('/unknown.png')
    expect(result).toBeNull()
  })

  it('serves the custom SVG fetched from S3 when an ObjectRef is configured', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(
      bundleWith({ faviconSvg: ref('etag-svg', 'image/svg+xml', 42) }),
    )
    vi.mocked(fetchBrandingObject).mockResolvedValue(Buffer.from('<svg>custom</svg>', 'utf8'))

    const result = await resolveSiteAsset('/favicon.svg')
    expect(result).not.toBeNull()
    expect(result!.contentType).toBe('image/svg+xml')
    expect(result!.etag).toBe('etag-svg')
    expect(result!.content.toString('utf8')).toBe('<svg>custom</svg>')
  })

  it('serves the custom binary fetched from S3 when an ObjectRef is configured', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(
      bundleWith({ appleTouchIcon: ref('etag-png', 'image/png', 99) }),
    )
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    vi.mocked(fetchBrandingObject).mockResolvedValue(png)

    const result = await resolveSiteAsset('/apple-touch-icon.png')
    expect(result).not.toBeNull()
    expect(result!.contentType).toBe('image/png')
    expect(result!.etag).toBe('etag-png')
    expect(result!.content.equals(png)).toBe(true)
  })

  it('falls back to default SVG when no ObjectRef configured', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(bundleWith({}))

    const result = await resolveSiteAsset('/favicon.svg')
    expect(result).not.toBeNull()
    expect(result!.contentType).toBe('image/svg+xml')
    expect(result!.content.length).toBeGreaterThan(0)
    expect(result!.etag).toMatch(/^[a-f0-9]{64}$/)
  })

  it('falls back to default binary when no ObjectRef configured', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(bundleWith({}))

    const result = await resolveSiteAsset('/images/icon-192.png')
    expect(result).not.toBeNull()
    expect(result!.contentType).toBe('image/png')
    expect(result!.content.length).toBeGreaterThan(0)
    expect(result!.etag).toMatch(/^[a-f0-9]{64}$/)
  })

  it('falls back to default when S3 fetch returns null', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue(
      bundleWith({ logoSvg: ref('etag-broken', 'image/svg+xml', 7) }),
    )
    vi.mocked(fetchBrandingObject).mockResolvedValue(null)

    const result = await resolveSiteAsset('/logo.svg')
    expect(result).not.toBeNull()
    expect(result!.content.length).toBeGreaterThan(0)
    expect(result!.etag).not.toBe('etag-broken')
  })

  it('falls back to default when assets section is missing', async () => {
    vi.mocked(getBlogSettingsBundleSync).mockReturnValue({ assets: null } as unknown as BlogSettingsBundle)

    const result = await resolveSiteAsset('/logo.svg')
    expect(result).not.toBeNull()
    expect(result!.content.length).toBeGreaterThan(0)
  })

  it('returns null for /robots.txt (handled by the route, not resolveSiteAsset)', async () => {
    const result = await resolveSiteAsset('/robots.txt')
    expect(result).toBeNull()
  })
})
