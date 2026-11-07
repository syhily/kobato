import { describe, expect, it } from 'vitest'

import { formatLocalDate, formatShowDate, localDateParts } from '@/shared/utils/formatter'

const SETTINGS = {
  settings: { locale: 'zh-CN', timeZone: 'Asia/Shanghai', timeFormat: 'yyyy-LL-dd HH:mm' },
}

const NEW_YORK = {
  settings: { locale: 'en-US', timeZone: 'America/New_York', timeFormat: 'yyyy-LL-dd HH:mm' },
}

describe('shared/utils/formatter — formatShowDate far-past branch', () => {
  it('falls through to formatLocalDate when the delta is >= 210 days', () => {
    const past = new Date('2020-01-01T00:00:00Z')
    const now = new Date('2024-01-01T00:00:00Z') // ~1461 days later
    const out = formatShowDate(past, SETTINGS, now)
    // Falls back to the configured timeFormat template.
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('localizes the relative buckets per locale (en-US / zh-HK / zh-TW)', () => {
    const now = new Date('2024-06-15T12:00:00+08:00')
    const same = new Date('2024-06-15T01:00:00+08:00')
    const yesterday = new Date('2024-06-14T01:00:00+08:00')
    const en = { settings: { locale: 'en-US', timeZone: 'Asia/Shanghai', timeFormat: 'yyyy-LL-dd' } }
    const hk = { settings: { locale: 'zh-HK', timeZone: 'Asia/Shanghai', timeFormat: 'yyyy-LL-dd' } }
    const tw = { settings: { locale: 'zh-TW', timeZone: 'Asia/Shanghai', timeFormat: 'yyyy-LL-dd' } }

    expect(formatShowDate(same, en, now)).toBe('today')
    expect(formatShowDate(yesterday, en, now)).toBe('yesterday')
    expect(formatShowDate(same, hk, now)).toBe('今日')
    expect(formatShowDate(yesterday, hk, now)).toBe('昨日')
    expect(formatShowDate(same, tw, now)).toBe('今天')
    expect(formatShowDate(yesterday, tw, now)).toBe('昨天')
  })

  it('uses "今天" when the date is the same day as now', () => {
    const now = new Date('2024-06-15T12:00:00+08:00')
    const same = new Date('2024-06-15T01:00:00+08:00')
    expect(formatShowDate(same, SETTINGS, now)).toBe('今天')
  })
})

describe('shared/utils/formatter — formatLocalDate token substitution', () => {
  it('substitutes every supported token', () => {
    const iso = '2024-03-05T06:07:08Z'
    // Asia/Shanghai is UTC+8 → 14:07:08 local. We assert each token appears.
    const out = formatLocalDate(iso, 'yyyy-LL-MM-dd HH:mm:ss', SETTINGS)
    // Two substitutions both produce the month ("03"), so MM and LL match.
    expect(out).toBe('2024-03-03-05 14:07:08')
  })

  it('uses the configured timeFormat when no explicit format is passed', () => {
    const out = formatLocalDate('2024-03-05T06:07:08Z', undefined, SETTINGS)
    expect(out).toBe('2024-03-05 14:07')
  })

  it('pads the hour to 00 at local midnight (h23 semantics)', () => {
    // 2024-03-05T16:00:00Z is exactly midnight 2024-03-06 in Asia/Shanghai.
    const out = formatLocalDate('2024-03-05T16:00:00Z', 'yyyy-LL-dd HH:mm:ss', SETTINGS)
    expect(out).toBe('2024-03-06 00:00:00')
  })

  it('preserves arbitrary literal text between tokens', () => {
    const out = formatLocalDate('2024-03-05T06:07:08Z', 'yyyy年LL月dd日 HH时mm分ss秒', SETTINGS)
    expect(out).toBe('2024年03月05日 14时07分08秒')
  })

  it('substitutes the dayPeriod token but leaves other date-fns letters verbatim', () => {
    // The format string is user-supplied: only the nine documented tokens are
    // substituted — `E`, `p` (and any other letter) must render as-is.
    const out = formatLocalDate('2024-03-05T06:07:08Z', 'yyyy年LL月dd日 a E p', SETTINGS)
    expect(out).toBe('2024年03月05日 下午 E p')
  })

  it('substitutes the 12-hour token and a localized dayPeriod', () => {
    // 14:07 Asia/Shanghai → 02:07 PM.
    expect(formatLocalDate('2024-03-05T06:07:08Z', 'hh:mm a', SETTINGS)).toBe('02:07 下午')
    expect(formatLocalDate('2024-03-05T06:07:08Z', 'HH:mm a', SETTINGS)).toBe('14:07 下午')
    expect(formatLocalDate('2024-03-05T18:07:08Z', 'hh:mm a', SETTINGS)).toBe('02:07 上午')
    // March 5 in New York is EST (UTC-5) → 01:07 AM.
    expect(formatLocalDate('2024-03-05T06:07:08Z', 'hh:mm a', NEW_YORK)).toBe('01:07 AM')
  })

  it('only treats a STANDALONE `a` as the dayPeriod token', () => {
    // `day` is a literal word in the custom pattern, not a token + letters.
    expect(formatLocalDate('2024-03-05T06:07:08Z', 'day=dd month=LL year=yyyy', SETTINGS)).toBe(
      'day=05 month=03 year=2024',
    )
  })

  it('substitutes tokens adjacent to date-fns-token letters without swallowing them', () => {
    const out = formatLocalDate('2024-03-05T06:07:08Z', 'day=dd month=LL year=yyyy', SETTINGS)
    expect(out).toBe('day=05 month=03 year=2024')
  })

  it('throws RangeError on invalid date input (garbage-in parity with Intl)', () => {
    expect(() => formatLocalDate('not-a-date', 'yyyy-LL-dd', SETTINGS)).toThrow(RangeError)
    expect(() => formatLocalDate('not-a-date', 'yyyy-LL-dd', SETTINGS)).toThrow('Invalid time value')
  })

  it('localDateParts throws RangeError on invalid date input', () => {
    expect(() => localDateParts(new Date(Number.NaN), 'zh-CN', 'Asia/Shanghai')).toThrow(RangeError)
  })

  it('handles the America/New_York spring-forward gap', () => {
    // 2024-03-10: 02:00–03:00 local does not exist; 06:30Z is 01:30 EST, 07:30Z is 03:30 EDT.
    expect(formatLocalDate('2024-03-10T06:30:00Z', 'yyyy-LL-dd HH:mm:ss', NEW_YORK)).toBe('2024-03-10 01:30:00')
    expect(formatLocalDate('2024-03-10T07:30:00Z', 'yyyy-LL-dd HH:mm:ss', NEW_YORK)).toBe('2024-03-10 03:30:00')
  })

  it('handles the America/New_York fall-back overlap', () => {
    // 2024-11-03: 01:30 happens twice (EDT then EST) — both instants render identically.
    expect(formatLocalDate('2024-11-03T05:30:00Z', 'yyyy-LL-dd HH:mm:ss', NEW_YORK)).toBe('2024-11-03 01:30:00')
    expect(formatLocalDate('2024-11-03T06:30:00Z', 'yyyy-LL-dd HH:mm:ss', NEW_YORK)).toBe('2024-11-03 01:30:00')
  })

  it('localDateParts returns numeric calendar fields in the configured zone', () => {
    expect(localDateParts(new Date('2024-03-05T06:07:08Z'), 'zh-CN', 'Asia/Shanghai')).toEqual({
      year: 2024,
      month: 3,
      day: 5,
      hour: 14,
      minute: 7,
      second: 8,
    })
  })
})
