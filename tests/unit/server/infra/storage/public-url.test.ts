import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ActionFailure } from '@/server/infra/http/errors'

// `resolveAssetUrl` reads the CDN host + site origin off the settings
// bundle via `requireBlogSettingsSection`. Stub the getter so each test
// controls the two sections it cares about.
vi.mock('@/shared/config/getters', () => ({
  // Return type `unknown` keeps the mock loosely typed so per-test overrides
  // can return partial section shapes without fighting the real (big) union.
  requireBlogSettingsSection: vi.fn((_section: string): unknown => ({})),
}))

const { requireBlogSettingsSection } = (await import('@/shared/config/getters')) as unknown as {
  // Cast to a loose mock type so per-test overrides can return partial
  // section shapes without matching the real (large) section union.
  requireBlogSettingsSection: ReturnType<typeof vi.fn>
}
const { resolveAssetUrl, safeResolveAssetUrl } = await import('@/server/infra/storage/public-url')

beforeEach(() => {
  requireBlogSettingsSection.mockImplementation((section: string) => {
    if (section === 'assets') {
      return { asset: { scheme: 'https', host: 'cdn.example.com' } }
    }
    if (section === 'siteIdentity') {
      return { website: 'https://site.example.com' }
    }
    return {}
  })
})

describe('resolveAssetUrl — driver dispatch', () => {
  it('joins the CDN base for an s3 asset', () => {
    expect(resolveAssetUrl('s3', 'images/2026/05/x.jpg')).toBe('https://cdn.example.com/images/2026/05/x.jpg')
  })

  it('joins the site origin + /storage for a local asset', () => {
    expect(resolveAssetUrl('local', 'images/2026/05/x.jpg')).toBe(
      'https://site.example.com/storage/images/2026/05/x.jpg',
    )
  })

  it('trims a leading slash on the storage path', () => {
    expect(resolveAssetUrl('local', '/musics/a.mp3')).toBe('https://site.example.com/storage/musics/a.mp3')
  })

  it('appends ?v=<updatedAtMs> when provided', () => {
    expect(resolveAssetUrl('local', 'images/a.jpg', 123)).toBe('https://site.example.com/storage/images/a.jpg?v=123')
  })
})

describe('resolveAssetUrl — missing-base guards', () => {
  it('throws ActionFailure(503) for an s3 asset when the CDN host is empty', () => {
    requireBlogSettingsSection.mockImplementation((section: string) =>
      section === 'assets' ? { asset: { scheme: 'https', host: '' } } : { website: 'https://site.example.com' },
    )
    expect(() => resolveAssetUrl('s3', 'images/a.jpg')).toThrow(ActionFailure)
    expect(safeResolveAssetUrl('s3', 'images/a.jpg')).toBeNull()
  })

  it('throws ActionFailure(503) for a local asset when the site origin is empty (no relative URL)', () => {
    requireBlogSettingsSection.mockImplementation((section: string) =>
      section === 'siteIdentity' ? { website: '' } : { asset: { scheme: 'https', host: 'cdn.example.com' } },
    )
    expect(() => resolveAssetUrl('local', 'images/a.jpg')).toThrow(ActionFailure)
    expect(safeResolveAssetUrl('local', 'images/a.jpg')).toBeNull()
  })

  it('re-throws non-ActionFailure errors from safeResolveAssetUrl', () => {
    requireBlogSettingsSection.mockImplementation(() => {
      throw new Error('boom')
    })
    expect(() => safeResolveAssetUrl('s3', 'images/a.jpg')).toThrow('boom')
  })
})
