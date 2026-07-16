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
    requireBlogSettingsSection.mockImplementation((section: string) =>
      section === 'siteIdentity' ? { website: '' } : { asset: { scheme: 'https', host: 'cdn.example.com' } },
    )
    expect(() => resolveAssetUrl('local', CSS_KEY, undefined, FONT_OPTIONS)).toThrow(ActionFailure)
    expect(() => resolveAssetUrl('local', CSS_KEY, undefined, FONT_OPTIONS)).toThrow(
      '请先在 /admin/settings/general 配置站点网址（siteIdentity.website）',
    )
  })

  it('still throws ActionFailure(503) for s3 when the CDN host is empty (options ignored)', () => {
    requireBlogSettingsSection.mockImplementation((section: string) =>
      section === 'assets' ? { asset: { scheme: 'https', host: '' } } : { website: 'https://site.example.com' },
    )
    expect(() => resolveAssetUrl('s3', CSS_KEY, undefined, FONT_OPTIONS)).toThrow(ActionFailure)
    expect(() => resolveAssetUrl('s3', CSS_KEY, undefined, FONT_OPTIONS)).toThrow(
      '请先在 /admin/settings/assets 配置 S3 公共访问基地址',
    )
  })
})
