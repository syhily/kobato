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
