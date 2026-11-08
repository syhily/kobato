import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { formatTimeLabel } from '@/ui/admin/analytics/time-labels'

// Analytics bucket labels are BROWSER-zoned: the helper must format the parsed
// label in the zone it is handed (the chart passes `getClientTimezone()`), with
// the active UI locale, never a pinned zh-CN.
//
// `parseTimeLabel` reads a label as HOST-local time, so the host zone is pinned
// to UTC to make the input instant machine-independent. The expected strings
// below are literal CLDR output (not produced by another Intl call in the
// test): a formatter regression or an ICU data change is review-visible
// instead of being mirrored by the assertion.

const ORIGINAL_TZ = process.env.TZ

beforeAll(() => {
  process.env.TZ = 'UTC'
})

afterAll(() => {
  if (ORIGINAL_TZ === undefined) {
    delete process.env.TZ
  } else {
    process.env.TZ = ORIGINAL_TZ
  }
})

describe('ui/admin/analytics/time-labels — browser-zone labels', () => {
  it('formats the hour bucket with each locale/time zone literal', () => {
    // 14:00 UTC in each zone; zh-TW / zh-HK insert a thin space (U+2009)
    // between the date and the day-period clock.
    const label = '2026-03-05 14'
    expect(formatTimeLabel('hour', label, { locale: 'zh-CN', timeZone: 'Asia/Shanghai' })).toBe('2026/3/5 22:00')
    expect(formatTimeLabel('hour', label, { locale: 'en-US', timeZone: 'America/New_York' })).toBe('3/5/26, 9:00 AM')
    expect(formatTimeLabel('hour', label, { locale: 'zh-TW', timeZone: 'Asia/Taipei' })).toBe('2026/3/5\u2009晚上10:00')
    expect(formatTimeLabel('hour', label, { locale: 'zh-HK', timeZone: 'Asia/Hong_Kong' })).toBe(
      '5/3/2026\u2009下午10:00',
    )
  })

  it('localizes the day bucket (medium date) with literal output', () => {
    const label = '2026-03-05'
    expect(formatTimeLabel('day', label, { locale: 'en-US', timeZone: 'UTC' })).toBe('Mar 5, 2026')
    expect(formatTimeLabel('day', label, { locale: 'zh-CN', timeZone: 'UTC' })).toBe('2026年3月5日')
    expect(formatTimeLabel('day', label, { locale: 'zh-TW', timeZone: 'UTC' })).toBe('2026年3月5日')
    expect(formatTimeLabel('day', label, { locale: 'zh-HK', timeZone: 'UTC' })).toBe('2026年3月5日')
  })

  it('honours an explicitly different zone instead of the host zone', () => {
    // 12:00 in the pinned host zone (UTC); Etc/GMT-9 is UTC+9, so the clock
    // label moves to 21:00 even though the parsed instant is identical.
    const label = '2026-03-05 12'
    expect(formatTimeLabel('hour', label, { locale: 'en-US', timeZone: 'UTC' })).toBe('3/5/26, 12:00 PM')
    expect(formatTimeLabel('hour', label, { locale: 'en-US', timeZone: 'Etc/GMT-9' })).toBe('3/5/26, 9:00 PM')
  })

  it('returns a malformed label verbatim', () => {
    expect(formatTimeLabel('hour', 'not-a-label', { locale: 'en-US', timeZone: 'UTC' })).toBe('not-a-label')
  })
})
