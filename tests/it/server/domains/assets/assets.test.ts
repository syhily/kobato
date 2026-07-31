import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { BrandingObjectRef, SiteAssetBranding } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { makeMemoryBackend } from '#/_helpers/memory-storage'
import { resolveSiteAsset } from '@/server/domains/assets/services/routes'
import { fetchBrandingObject } from '@/server/domains/assets/services/storage'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@/server/infra/storage/registry'

// The storage registry is the only substituted boundary: branding reads
// route to a shared in-memory backend (a true external — S3/local disk)
// injected through the registry's test seam, so the real fetchBrandingObject
// runs end-to-end — buffer cache, not-found fallback, and legacy-key
// migration included. Every branding ref here carries driver 's3', so the
// seam substitutes the 's3' driver only.
const mem = makeMemoryBackend()

beforeEach(() => {
  __setStorageBackendForTests('s3', mem.backend)
  seedBranding({})
})

afterEach(() => {
  __resetStorageBackendsForTests()
  mem.reset()
})

function seedBranding(branding: SiteAssetBranding): void {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    assets: { ...TEST_BLOG_SETTINGS_BUNDLE.assets!, branding },
  })
}

function ref(etag: string, contentType: string, bytes: number): BrandingObjectRef {
  return { etag, contentType, size: bytes, updatedAt: '2024-01-01T00:00:00.000Z', driver: 's3' }
}

function seedObject(key: string, body: Buffer, contentType: string): void {
  mem.store.set(key, { body, contentType })
}

describe('resolveSiteAsset', () => {
  it('returns null for unknown paths', async () => {
    const result = await resolveSiteAsset('/unknown.png')
    expect(result).toBeNull()
  })

  it('serves the custom SVG fetched from storage when an ObjectRef is configured', async () => {
    seedBranding({ faviconSvg: ref('etag-svg', 'image/svg+xml', 42) })
    seedObject('branding/favicon.svg', Buffer.from('<svg>custom</svg>', 'utf8'), 'image/svg+xml')

    const result = await resolveSiteAsset('/favicon.svg')
    expect(result).not.toBeNull()
    expect(result!.contentType).toBe('image/svg+xml')
    expect(result!.etag).toBe('etag-svg')
    expect(result!.content.toString('utf8')).toBe('<svg>custom</svg>')
  })

  it('serves the custom binary fetched from storage when an ObjectRef is configured', async () => {
    seedBranding({ appleTouchIcon: ref('etag-png', 'image/png', 99) })
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    seedObject('branding/apple-touch-icon.png', png, 'image/png')

    const result = await resolveSiteAsset('/apple-touch-icon.png')
    expect(result).not.toBeNull()
    expect(result!.contentType).toBe('image/png')
    expect(result!.etag).toBe('etag-png')
    expect(result!.content.equals(png)).toBe(true)
  })

  it('migrates an object stored under the legacy extensionless key', async () => {
    seedBranding({ logoSvg: ref('etag-legacy', 'image/svg+xml', 30) })
    const legacy = Buffer.from('<svg>legacy</svg>', 'utf8')
    seedObject('branding/logo-svg', legacy, 'image/svg+xml')

    const result = await resolveSiteAsset('/logo.svg')
    expect(result).not.toBeNull()
    expect(result!.etag).toBe('etag-legacy')
    expect(result!.content.equals(legacy)).toBe(true)
    // fetchBrandingObject copied the bytes to the current key.
    expect(mem.store.has('branding/logo.svg')).toBe(true)
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

  it('falls back to default when the stored object is missing', async () => {
    seedBranding({ logoSvg: ref('etag-broken', 'image/svg+xml', 7) })

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

  it('serves a second read of the same ref from the in-process buffer cache', async () => {
    seedBranding({ faviconSvg: ref('etag-cached', 'image/svg+xml', 42) })
    seedObject('branding/favicon.svg', Buffer.from('<svg>cached</svg>', 'utf8'), 'image/svg+xml')

    const first = await fetchBrandingObject('faviconSvg', ref('etag-cached', 'image/svg+xml', 42))
    expect(first?.toString('utf8')).toBe('<svg>cached</svg>')
    // Drop the stored object: the cached read must still succeed.
    mem.store.clear()
    const second = await fetchBrandingObject('faviconSvg', ref('etag-cached', 'image/svg+xml', 42))
    expect(second?.toString('utf8')).toBe('<svg>cached</svg>')
  })

  it('returns null for /robots.txt (handled by the route, not resolveSiteAsset)', async () => {
    const result = await resolveSiteAsset('/robots.txt')
    expect(result).toBeNull()
  })
})
