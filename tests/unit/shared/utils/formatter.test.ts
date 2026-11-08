import { describe, expect, it } from 'vitest'

import { formatLocalDate, formatShowDate } from '@/shared/utils/formatter'

// Minimal aggregated-shaped fixture; only the locale/timeZone/timeFormat slice is read.
const config = {
  settings: {
    locale: 'zh-CN',
    timeZone: 'Asia/Shanghai',
    timeFormat: 'yyyy-LL-dd HH:mm',
  },
}

describe('shared/utils/formatter — date formatting', () => {
  it('formatShowDate returns 今天 for the current calendar day', () => {
    expect(formatShowDate(new Date(), config)).toBe('今天')
  })

  it('formatShowDate returns 昨天 for one day before now', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
    expect(formatShowDate(yesterday, config)).toBe('昨天')
  })

  it("formatShowDate returns 'N 天前' inside the past week (RelativeTimeFormat, no space in zh-CN)", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    expect(formatShowDate(threeDaysAgo, config)).toMatch(/^[1-6]天前$/)
  })

  it('formatShowDate uses the optional reference instant instead of the runtime clock', () => {
    const postDay = new Date('2024-06-10T16:00:00.000Z')
    expect(formatShowDate(postDay, config, '2024-06-11T16:00:00.000Z')).toBe('昨天')
    expect(formatShowDate(postDay, config, '2024-06-12T16:00:00.000Z')).toBe('2天前')
  })

  it('keeps the 2/7/30/210-day relative buckets in one place', () => {
    const now = new Date('2024-06-15T12:00:00+08:00')
    const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000)

    expect(formatShowDate(daysAgo(0), config, now)).toBe('今天')
    expect(formatShowDate(daysAgo(1), config, now)).toBe('昨天')
    expect(formatShowDate(daysAgo(2), config, now)).toBe('2天前')
    expect(formatShowDate(daysAgo(6), config, now)).toBe('6天前')
    // Week labels are Monday-start aligned…
    expect(formatShowDate(daysAgo(7), config, now)).toBe('1周前')
    expect(formatShowDate(daysAgo(29), config, now)).toBe('4周前')
    // …then calendar months, until the 210-day relative window closes.
    expect(formatShowDate(daysAgo(30), config, now)).toBe('1个月前')
    expect(formatShowDate(daysAgo(209), config, now)).toBe('6个月前')
    expect(formatShowDate(daysAgo(210), config, now)).toBe('2023-11-18 12:00')
  })

  it('counts whole calendar months by day-of-month through the wrapper', () => {
    const at = (now: string) => new Date(now)

    // Jan 30 → Mar 1 is 30 days but ONE whole month (March 30 has not arrived).
    expect(formatShowDate(new Date('2026-01-30T12:00:00+08:00'), config, at('2026-03-01T12:00:00+08:00'))).toBe(
      '1个月前',
    )
    // Cross-year: Dec 31 → Mar 1 is two whole months.
    expect(formatShowDate(new Date('2025-12-31T12:00:00+08:00'), config, at('2026-03-01T12:00:00+08:00'))).toBe(
      '2个月前',
    )
    // Month-end clamps: Jan 31 + 3 months is Apr 30.
    expect(formatShowDate(new Date('2026-01-31T12:00:00+08:00'), config, at('2026-04-30T12:00:00+08:00'))).toBe(
      '3个月前',
    )
    // Exactly 30 days, unaligned — still one month, never zero.
    expect(formatShowDate(new Date('2024-05-16T12:00:00+08:00'), config, new Date('2024-06-15T12:00:00+08:00'))).toBe(
      '1个月前',
    )
  })

  it('labels future (scheduled) dates forward instead of "today"', () => {
    const now = new Date('2024-06-15T12:00:00+08:00')
    const daysAhead = (days: number) => new Date(now.getTime() + days * 86_400_000)

    expect(formatShowDate(daysAhead(0), config, now)).toBe('今天')
    // Later the same calendar day is still today.
    expect(formatShowDate(new Date('2024-06-15T20:00:00+08:00'), config, now)).toBe('今天')
    expect(formatShowDate(daysAhead(1), config, now)).toBe('明天')
    expect(formatShowDate(daysAhead(3), config, now)).toBe('3天后')
    expect(formatShowDate(daysAhead(14), config, now)).toBe('2周后')
    expect(formatShowDate(daysAhead(70), config, now)).toBe('2个月后')
  })

  it('keeps the RangeError garbage-in behavior for invalid dates', () => {
    expect(() => formatShowDate(new Date(Number.NaN), config, new Date('2024-06-15T12:00:00Z'))).toThrow(RangeError)
  })

  it('formatLocalDate honours an explicit format string', () => {
    const date = new Date('2024-05-15T12:34:56.000Z')
    expect(formatLocalDate(date, 'yyyy-LL-dd', config)).toBe('2024-05-15')
  })

  describe('timeFormat: null (follow the locale)', () => {
    const auto = { settings: { ...config.settings, timeFormat: null } }

    it('renders the locale default in the site time zone', () => {
      const date = new Date('2024-05-15T06:34:56.000Z')
      // 06:34 UTC is 14:34 in Asia/Shanghai; zh-CN short date + short time.
      expect(formatLocalDate(date, undefined, auto)).toBe('2024/5/15 14:34')
    })

    it('follows the locale rather than a fixed pattern', () => {
      const date = new Date('2024-05-15T06:34:56.000Z')
      const english = { settings: { ...config.settings, locale: 'en-US', timeZone: 'UTC', timeFormat: null } }
      expect(formatLocalDate(date, undefined, english)).toBe('5/15/24, 6:34 AM')
    })

    it('formatShowDate falls back to the locale default past the relative window', () => {
      const date = new Date('2023-01-02T06:00:00.000Z')
      expect(formatShowDate(date, auto, '2024-06-01T00:00:00.000Z')).toBe('2023/1/2 14:00')
    })
  })
})
