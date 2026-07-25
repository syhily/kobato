import { describe, expect, it } from 'vitest'

import type { SiteAssetBranding, SidebarSettings } from '@/shared/config/types'

import { brandingVersion, extractXHandle, isSidebarWidgetEnabled } from '@/shared/config/utils'

// --- isSidebarWidgetEnabled (getSidebarWidgetCount is covered in utils.test.ts) --

function sidebarSettings(widgets: SidebarSettings['sidebar']['widgets']): SidebarSettings {
  return { sidebar: { widgets, dailyQuote: { source: 'shanbay', customQuotes: [] } } }
}

describe('shared/config/utils — isSidebarWidgetEnabled', () => {
  it('returns true when a matching enabled widget exists', () => {
    expect(
      isSidebarWidgetEnabled(
        sidebarSettings([
          { type: 'search', enabled: false },
          { type: 'randomTags', enabled: true },
        ]),
        'randomTags',
      ),
    ).toBe(true)
  })

  it('returns false when the widget is disabled or missing', () => {
    expect(isSidebarWidgetEnabled(sidebarSettings([{ type: 'search', enabled: false }]), 'search')).toBe(false)
    expect(isSidebarWidgetEnabled(sidebarSettings([]), 'todayCalendar')).toBe(false)
  })
})

// --- extractXHandle -------------------------------------------------------

describe('shared/config/utils — extractXHandle', () => {
  it('returns undefined when no X network is present', () => {
    expect(extractXHandle([])).toBeUndefined()
    expect(extractXHandle([{ network: 'github' as never, link: 'https://github.com/x' }])).toBeUndefined()
  })

  it('returns undefined when X is present but link is empty', () => {
    expect(extractXHandle([{ network: 'x' as never, link: '' }])).toBeUndefined()
  })

  it('returns undefined when the link is not a valid URL', () => {
    expect(extractXHandle([{ network: 'x' as never, link: 'not a url' }])).toBeUndefined()
  })

  it('returns undefined when the URL pathname is empty (root only)', () => {
    expect(extractXHandle([{ network: 'x' as never, link: 'https://x.com/' }])).toBeUndefined()
  })

  it('prepends @ to the handle when missing', () => {
    expect(extractXHandle([{ network: 'x' as never, link: 'https://x.com/elonmusk' }])).toBe('@elonmusk')
  })

  it('preserves a leading @ in the handle', () => {
    expect(extractXHandle([{ network: 'x' as never, link: 'https://x.com/@elonmusk' }])).toBe('@elonmusk')
  })
})

// --- brandingVersion ------------------------------------------------------

describe('shared/config/utils — brandingVersion', () => {
  it('returns empty string when branding is null / undefined', () => {
    expect(brandingVersion(null)).toBe('')
    expect(brandingVersion(undefined)).toBe('')
  })

  it('returns empty string when branding has no etag refs', () => {
    const branding = {} as SiteAssetBranding
    expect(brandingVersion(branding)).toBe('')
  })

  it('ignores entries that are not etag records', () => {
    const branding = {
      faviconSvg: { etag: 'a' },
      logoSvg: 'not a record' as never,
      logoDarkSvg: { nope: 1 } as never,
    } as unknown as SiteAssetBranding
    // Single etag 'a' — non-empty, returns a deterministic hash.
    const v = brandingVersion(branding)
    expect(v).not.toBe('')
    expect(v).toBe(brandingVersion(branding)) // stable
  })

  it('produces a stable deterministic hash for a given etag set', () => {
    const a: SiteAssetBranding = {
      faviconSvg: { etag: 'abc', contentType: '', size: 0, updatedAt: '' },
    } as unknown as SiteAssetBranding
    const b: SiteAssetBranding = {
      logoSvg: { etag: 'abc', contentType: 'x', size: 1, updatedAt: 'y' },
    } as unknown as SiteAssetBranding
    // Same single etag → same version regardless of other fields / keys.
    expect(brandingVersion(a)).toBe(brandingVersion(b))
  })

  it('produces different hashes for different etag sets', () => {
    const a: SiteAssetBranding = {
      faviconSvg: { etag: 'abc' },
    } as unknown as SiteAssetBranding
    const b: SiteAssetBranding = {
      faviconSvg: { etag: 'xyz' },
    } as unknown as SiteAssetBranding
    expect(brandingVersion(a)).not.toBe(brandingVersion(b))
  })
})
