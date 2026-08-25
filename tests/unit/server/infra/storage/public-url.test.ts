import { beforeEach, describe, expect, it } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { ActionFailure } from '@/server/infra/http/errors'
import { getPublicBaseUrl, resolveAssetUrl, safeResolveAssetUrl } from '@/server/infra/storage/public-url'

// `resolveAssetUrl` reads the real settings snapshot; each test overrides one section at a time.
function seedSettings(overrides: { assetHost?: string; storageEnabled?: boolean; website?: string | null } = {}) {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    siteIdentity: {
      ...TEST_BLOG_SETTINGS_BUNDLE.siteIdentity!,
      // Nullable on purpose — the unset-website path is under test; the section type is string.
      website: (overrides.website === undefined ? 'https://site.example.com' : overrides.website) as string,
    },
    assets: {
      ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
      asset: { scheme: 'https', host: overrides.assetHost ?? 'cdn.example.com' },
      storage: {
        ...TEST_BLOG_SETTINGS_BUNDLE.assets!.storage,
        enabled: overrides.storageEnabled ?? true,
      },
    },
  })
}

beforeEach(() => {
  seedSettings()
})

describe('getPublicBaseUrl', () => {
  it('derives the base URL from the assets section host', () => {
    expect(getPublicBaseUrl()).toBe('https://cdn.example.com')
  })

  it('follows asset host updates immediately', () => {
    seedSettings({ assetHost: 'assets2.example.com' })
    expect(getPublicBaseUrl()).toBe('https://assets2.example.com')
  })

  it('keeps reporting the host-derived base when uploads are OFF (the 302 target survives the toggle)', () => {
    seedSettings({ storageEnabled: false })
    expect(getPublicBaseUrl()).toBe('https://cdn.example.com')
  })

  it('returns null when the CDN host is empty', () => {
    seedSettings({ assetHost: '' })
    expect(getPublicBaseUrl()).toBeNull()
  })
})

// Site-owned contract: every stored asset renders as `${website}/storage/<key>`
// regardless of the driver holding the bytes; the `/storage/*` route redirects.
describe('resolveAssetUrl — site-owned URLs', () => {
  it('joins the site origin + /storage for a local asset', () => {
    expect(resolveAssetUrl('images/2026/05/x.jpg')).toBe('https://site.example.com/storage/images/2026/05/x.jpg')
  })

  it('emits the same site-owned form for an s3 asset (never the CDN base)', () => {
    expect(resolveAssetUrl('images/2026/05/x.jpg')).toBe('https://site.example.com/storage/images/2026/05/x.jpg')
    seedSettings({ storageEnabled: false })
    expect(resolveAssetUrl('images/2026/05/x.jpg')).toBe('https://site.example.com/storage/images/2026/05/x.jpg')
  })

  it('trims a leading slash on the storage path', () => {
    expect(resolveAssetUrl('/musics/a.mp3')).toBe('https://site.example.com/storage/musics/a.mp3')
  })

  it('appends ?v=<updatedAtMs> when provided', () => {
    expect(resolveAssetUrl('images/a.jpg', 123)).toBe('https://site.example.com/storage/images/a.jpg?v=123')
  })
})

describe('resolveAssetUrl — missing-origin guard', () => {
  it('throws ActionFailure(503) when the site origin is empty (no relative URL)', () => {
    seedSettings({ website: '' })
    expect(() => resolveAssetUrl('images/a.jpg')).toThrow(ActionFailure)
    expect(() => resolveAssetUrl('images/a.jpg')).toThrow(
      '请先在 /admin/settings/general 配置站点网址（siteIdentity.website）',
    )
    expect(safeResolveAssetUrl('images/a.jpg')).toBeNull()
  })

  it('re-throws non-ActionFailure errors from safeResolveAssetUrl', () => {
    // The unhydrated-snapshot Error must not be swallowed as an ActionFailure.
    setBlogSettingsBundleForTests(null)
    expect(() => safeResolveAssetUrl('images/a.jpg')).toThrow('not been hydrated')
  })
})

// Font URL contract (hard repo rule): `/fonts/embedded/<hash>/result.css` —
// the route override is driver-neutral, so the form holds for local AND s3 rows.
describe('resolveAssetUrl — route override (font options bag)', () => {
  const HASH = 'a'.repeat(64)
  const CSS_KEY = `fonts/${HASH}/result.css`
  const FONT_OPTIONS = { route: '/fonts/embedded/', stripPrefix: 'fonts/' }

  it('reproduces the embedded-font URL byte-for-byte', () => {
    expect(resolveAssetUrl(CSS_KEY, undefined, FONT_OPTIONS)).toBe(
      `https://site.example.com/fonts/embedded/${HASH}/result.css`,
    )
  })

  it('appends ?v=<updatedAtMs> under the route override', () => {
    expect(resolveAssetUrl(CSS_KEY, 123, FONT_OPTIONS)).toBe(
      `https://site.example.com/fonts/embedded/${HASH}/result.css?v=123`,
    )
  })

  it('keeps the full key when stripPrefix does not match', () => {
    expect(resolveAssetUrl('other/x.css', undefined, FONT_OPTIONS)).toBe(
      'https://site.example.com/fonts/embedded/other/x.css',
    )
  })

  it('still throws ActionFailure(503) when the site origin is empty', () => {
    seedSettings({ website: '' })
    expect(() => resolveAssetUrl(CSS_KEY, undefined, FONT_OPTIONS)).toThrow(ActionFailure)
  })
})
