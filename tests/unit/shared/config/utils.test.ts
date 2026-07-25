import { describe, expect, it } from 'vitest'

import { getSidebarWidgetCount } from '@/shared/config/utils'

describe('getSidebarWidgetCount', () => {
  const baseSettings = {
    sidebar: {
      widgets: [
        { type: 'search' as const, enabled: true },
        { type: 'recentPosts' as const, enabled: true, count: 5 },
        { type: 'recentComments' as const, enabled: false, count: 10 },
        { type: 'randomTags' as const, enabled: true, count: 20 },
        { type: 'todayCalendar' as const, enabled: true },
      ],
      dailyQuote: { source: 'shanbay' as const, customQuotes: [] },
    },
  }

  it('returns the count for an enabled widget', () => {
    expect(getSidebarWidgetCount(baseSettings, 'recentPosts')).toBe(5)
    expect(getSidebarWidgetCount(baseSettings, 'randomTags')).toBe(20)
  })

  it('returns 0 for a disabled widget even if count is present', () => {
    expect(getSidebarWidgetCount(baseSettings, 'recentComments')).toBe(0)
  })

  it('returns 0 when the widget type is not found', () => {
    const emptySettings = { sidebar: { widgets: [], dailyQuote: { source: 'shanbay' as const, customQuotes: [] } } }
    expect(getSidebarWidgetCount(emptySettings, 'recentPosts')).toBe(0)
  })

  it('returns 0 when count is missing for a count-capable widget', () => {
    const noCountSettings = {
      sidebar: {
        widgets: [{ type: 'recentPosts' as const, enabled: true }],
        dailyQuote: { source: 'shanbay' as const, customQuotes: [] },
      },
    }
    expect(getSidebarWidgetCount(noCountSettings, 'recentPosts')).toBe(0)
  })
})
