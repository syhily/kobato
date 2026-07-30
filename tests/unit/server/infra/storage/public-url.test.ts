import { beforeEach, describe, expect, it } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { ActionFailure } from '@/server/infra/http/errors'
import { getPublicBaseUrl, resolveAssetUrl, safeResolveAssetUrl } from '@/server/infra/storage/public-url'

// `resolveAssetUrl` reads the CDN host + site origin off the real settings
// snapshot. The baseline below keeps the historical fixture hosts so the
// expected URLs stay byte-for-byte stable; individual tests override the
// one section they care about.
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

  it('keeps reporting the host-derived base when uploads are OFF (so SSR can still render historical s3 rows)', () => {
    seedSettings({ storageEnabled: false })
    expect(getPublicBaseUrl()).toBe('https://cdn.example.com')
  })

  it('returns null when the CDN host is empty', () => {
    seedSettings({ assetHost: '' })
    expect(getPublicBaseUrl()).toBeNull()
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
    seedSettings({ assetHost: '' })
    expect(() => resolveAssetUrl('s3', 'images/a.jpg')).toThrow(ActionFailure)
    expect(safeResolveAssetUrl('s3', 'images/a.jpg')).toBeNull()
  })

  it('throws ActionFailure(503) for a local asset when the site origin is empty (no relative URL)', () => {
    seedSettings({ website: '' })
    expect(() => resolveAssetUrl('local', 'images/a.jpg')).toThrow(ActionFailure)
    expect(safeResolveAssetUrl('local', 'images/a.jpg')).toBeNull()
  })

  it('re-throws non-ActionFailure errors from safeResolveAssetUrl', () => {
    // An unhydrated snapshot makes the real getter throw a plain Error —
    // safeResolveAssetUrl must not swallow it as an ActionFailure.
    setBlogSettingsBundleForTests(null)
    expect(() => safeResolveAssetUrl('s3', 'images/a.jpg')).toThrow('not been hydrated')
  })
})

// The font URL contract (hard repo rule): local fonts are served from the
// dedicated `/fonts/embedded/<hash>/result.css` route, s3 fonts straight
// from `<publicBaseUrl>/fonts/<hash>/result.css`. The options bag below is
// exactly what the fonts render service passes — these tests pin the public
// URL shapes byte-for-byte.
describe('resolveAssetUrl — local route override (font options bag)', () => {
  const HASH = 'a'.repeat(64)
  const CSS_KEY = `fonts/${HASH}/result.css`
  const FONT_OPTIONS = { local: { route: '/fonts/embedded/', stripPrefix: 'fonts/' } }

  it('reproduces the embedded-font local URL byte-for-byte', () => {
    expect(resolveAssetUrl('local', CSS_KEY, undefined, FONT_OPTIONS)).toBe(
      `https://site.example.com/fonts/embedded/${HASH}/result.css`,
    )
  })

  it('keeps the s3 URL on the raw storage key (options ignored)', () => {
    expect(resolveAssetUrl('s3', CSS_KEY, undefined, FONT_OPTIONS)).toBe(`https://cdn.example.com/${CSS_KEY}`)
  })

  it('appends ?v=<updatedAtMs> under the route override, both drivers', () => {
    expect(resolveAssetUrl('local', CSS_KEY, 123, FONT_OPTIONS)).toBe(
      `https://site.example.com/fonts/embedded/${HASH}/result.css?v=123`,
    )
    expect(resolveAssetUrl('s3', CSS_KEY, 123, FONT_OPTIONS)).toBe(`https://cdn.example.com/${CSS_KEY}?v=123`)
  })

  it('keeps the full key when stripPrefix does not match', () => {
    expect(resolveAssetUrl('local', 'other/x.css', undefined, FONT_OPTIONS)).toBe(
      'https://site.example.com/fonts/embedded/other/x.css',
    )
  })

  it('still throws ActionFailure(503) for local when the site origin is empty', () => {
    seedSettings({ website: '' })
    expect(() => resolveAssetUrl('local', CSS_KEY, undefined, FONT_OPTIONS)).toThrow(ActionFailure)
    expect(() => resolveAssetUrl('local', CSS_KEY, undefined, FONT_OPTIONS)).toThrow(
      '请先在 /admin/settings/general 配置站点网址（siteIdentity.website）',
    )
  })

  it('still throws ActionFailure(503) for s3 when the CDN host is empty (options ignored)', () => {
    seedSettings({ assetHost: '' })
    expect(() => resolveAssetUrl('s3', CSS_KEY, undefined, FONT_OPTIONS)).toThrow(ActionFailure)
    expect(() => resolveAssetUrl('s3', CSS_KEY, undefined, FONT_OPTIONS)).toThrow(
      '请先在 /admin/settings/assets 配置 S3 公共访问基地址',
    )
  })
})
