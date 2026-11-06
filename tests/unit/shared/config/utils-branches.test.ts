import { describe, expect, it } from 'vitest'

import type { BrandingObjectRef, SidebarSettings } from '@/shared/config/types'

import { brandingVersionSuffix, extractXHandle, isSidebarWidgetEnabled } from '@/shared/config/utils'

// getSidebarWidgetCount is covered in utils.test.ts

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

describe('shared/config/utils — brandingVersionSuffix', () => {
  it('returns empty string when the ref is null / undefined', () => {
    expect(brandingVersionSuffix(null)).toBe('')
    expect(brandingVersionSuffix(undefined)).toBe('')
  })

  it('returns empty string when updatedAt is missing or unparseable', () => {
    expect(brandingVersionSuffix({ updatedAt: '' } as BrandingObjectRef)).toBe('')
    expect(brandingVersionSuffix({ updatedAt: 'not-a-date' } as BrandingObjectRef)).toBe('')
  })

  it('appends the updatedAt ms timestamp as ?v=', () => {
    const ref = { updatedAt: '2026-07-15T11:14:00.817Z' } as BrandingObjectRef
    expect(brandingVersionSuffix(ref)).toBe(`?v=${Date.parse('2026-07-15T11:14:00.817Z')}`)
  })

  it('changes when the ref is re-uploaded (new updatedAt)', () => {
    const before = { updatedAt: '2026-07-15T11:14:00.817Z' } as BrandingObjectRef
    const after = { updatedAt: '2026-11-07T01:00:00.000Z' } as BrandingObjectRef
    expect(brandingVersionSuffix(before)).not.toBe(brandingVersionSuffix(after))
  })
})
