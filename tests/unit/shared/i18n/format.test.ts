import { describe, expect, it } from 'vitest'

import {
  compareDisplayText,
  dateFnsLocaleFor,
  formatBytes,
  formatDate,
  formatDateTime,
  formatDisplayName,
  formatDuration,
  formatNumber,
  formatRelativeTime,
  formatRelativeValue,
} from '@/shared/i18n/format'

const INSTANT = '2024-03-05T06:07:08Z'
const SHANGHAI = 'Asia/Shanghai'
const NEW_YORK = 'America/New_York'

describe('shared/i18n/format — date and time', () => {
  it('formats the calendar date per locale in the site time zone', () => {
    expect(formatDate(INSTANT, { locale: 'zh-CN', timeZone: SHANGHAI })).toBe('2024/3/5')
    expect(formatDate(INSTANT, { locale: 'en-US', timeZone: SHANGHAI })).toBe('3/5/24')
    expect(formatDate(INSTANT, { locale: 'zh-HK', timeZone: SHANGHAI })).toBe('5/3/2024')
    expect(formatDate(INSTANT, { locale: 'zh-TW', timeZone: SHANGHAI })).toBe('2024/3/5')
  })

  it('formats date + time per locale', () => {
    expect(formatDateTime(INSTANT, { locale: 'zh-CN', timeZone: SHANGHAI })).toBe('2024/3/5 14:07')
    expect(formatDateTime(INSTANT, { locale: 'en-US', timeZone: SHANGHAI })).toBe('3/5/24, 2:07 PM')
  })

  it('is explicit about the zone: the same instant renders differently per time zone', () => {
    expect(formatDateTime(INSTANT, { locale: 'zh-CN', timeZone: SHANGHAI })).toBe('2024/3/5 14:07')
    expect(formatDateTime(INSTANT, { locale: 'zh-CN', timeZone: NEW_YORK })).toBe('2024/3/5 01:07')
    // …and per locale, never the runtime default.
    expect(formatDate(INSTANT, { locale: 'zh-CN', timeZone: 'UTC' })).toBe('2024/3/5')
    expect(formatDate(INSTANT, { locale: 'en-US', timeZone: 'UTC' })).toBe('3/5/24')
  })

  it('handles DST transitions in the configured zone', () => {
    // Spring forward: 2024-03-10 06:30Z is 01:30 EST, 07:30Z is 03:30 EDT.
    expect(formatDateTime('2024-03-10T06:30:00Z', { locale: 'zh-CN', timeZone: NEW_YORK })).toBe('2024/3/10 01:30')
    expect(formatDateTime('2024-03-10T07:30:00Z', { locale: 'zh-CN', timeZone: NEW_YORK })).toBe('2024/3/10 03:30')
    // Fall back: both 05:30Z and 06:30Z render as 01:30.
    expect(formatDateTime('2024-11-03T05:30:00Z', { locale: 'zh-CN', timeZone: NEW_YORK })).toBe('2024/11/3 01:30')
    expect(formatDateTime('2024-11-03T06:30:00Z', { locale: 'zh-CN', timeZone: NEW_YORK })).toBe('2024/11/3 01:30')
  })

  it('throws RangeError on invalid input (Intl garbage-in parity)', () => {
    expect(() => formatDate('not-a-date', { locale: 'zh-CN', timeZone: SHANGHAI })).toThrow(RangeError)
    expect(() => formatDateTime('not-a-date', { locale: 'zh-CN', timeZone: SHANGHAI })).toThrow(RangeError)
  })
})

describe('shared/i18n/format — relative time', () => {
  const options = { locale: 'zh-CN' as const, timeZone: SHANGHAI, now: '2024-06-15T12:00:00+08:00' }

  it('renders today/yesterday through numeric:auto', () => {
    expect(formatRelativeTime('2024-06-15T01:00:00+08:00', options)).toBe('今天')
    expect(formatRelativeTime('2024-06-14T01:00:00+08:00', options)).toBe('昨天')
    expect(formatRelativeTime('2024-06-12T01:00:00+08:00', options)).toBe('3天前')
    // numeric:auto keeps the idiomatic short forms for 2 days.
    expect(formatRelativeTime('2024-06-13T01:00:00+08:00', options)).toBe('前天')
  })

  it('renders each locale with its own relative vocabulary', () => {
    expect(formatRelativeTime('2024-06-15T01:00:00+08:00', { ...options, locale: 'en-US' })).toBe('today')
    expect(formatRelativeTime('2024-06-14T01:00:00+08:00', { ...options, locale: 'en-US' })).toBe('yesterday')
    expect(formatRelativeTime('2024-06-15T01:00:00+08:00', { ...options, locale: 'zh-HK' })).toBe('今日')
    expect(formatRelativeTime('2024-06-14T01:00:00+08:00', { ...options, locale: 'zh-TW' })).toBe('昨天')
  })

  it('picks weeks/months/years beyond the day window', () => {
    expect(formatRelativeTime('2024-05-25T01:00:00+08:00', options)).toBe('3周前')
    expect(formatRelativeTime('2024-03-15T01:00:00+08:00', options)).toBe('3个月前')
    expect(formatRelativeTime('2022-06-15T01:00:00+08:00', options)).toBe('2年前')
  })

  it('supports an explicit unit and relative value', () => {
    expect(formatRelativeValue(-3, 'week', 'zh-CN')).toBe('3周前')
    expect(formatRelativeValue(0, 'day', 'en-US', { numeric: 'auto' })).toBe('today')
    expect(formatRelativeTime('2024-06-18T12:00:00+08:00', { ...options, unit: 'day' })).toBe('3天后')
    // Hour granularity only on request — the default is calendar-day based.
    expect(formatRelativeTime('2024-06-15T01:00:00+08:00', { ...options, unit: 'hour' })).toBe('11小时前')
  })

  it('uses the passed reference instant, so SSR and hydration agree', () => {
    const value = '2024-06-10T12:00:00+08:00'
    expect(formatRelativeTime(value, { ...options, now: '2024-06-12T12:00:00+08:00' })).toBe('前天')
    // 10 calendar days lands in the week bucket (`numeric:auto` → 上周).
    expect(formatRelativeTime(value, { ...options, now: '2024-06-20T12:00:00+08:00' })).toBe('上周')
  })

  it('does calendar-day math in the SITE zone, not the host zone', () => {
    // 2024-06-14T23:30Z is already 2024-06-15 07:30 in Shanghai (today).
    expect(formatRelativeTime('2024-06-14T23:30:00Z', options)).toBe('今天')
    expect(formatRelativeTime('2024-06-14T23:30:00Z', { ...options, timeZone: 'UTC' })).toBe('昨天')
  })
})

describe('shared/i18n/format — numbers, bytes, durations', () => {
  it('formats numbers per locale', () => {
    expect(formatNumber(1234567.891, { locale: 'en-US' })).toBe('1,234,567.891')
    expect(formatNumber(1234567.891, { locale: 'zh-CN' })).toBe('1,234,567.891')
    expect(formatNumber(0.25, { locale: 'zh-CN', style: 'percent' })).toBe('25%')
    expect(formatNumber(12.5, { locale: 'en-US', minimumFractionDigits: 2 })).toBe('12.50')
  })

  it('formats byte sizes per locale', () => {
    expect(formatBytes(512, { locale: 'zh-CN' })).toBe('512字节')
    expect(formatBytes(512, { locale: 'en-US' })).toBe('512 bytes')
    expect(formatBytes(1536, { locale: 'zh-CN' })).toBe('1.5 kB')
    expect(formatBytes(1536, { locale: 'en-US' })).toBe('1.5 kB')
    expect(formatBytes(2.5 * 1024 ** 3, { locale: 'en-US' })).toBe('2.5 GB')
  })

  it('formats durations per locale with staircase truncation', () => {
    expect(formatDuration(300, { locale: 'zh-CN' })).toBe('300毫秒')
    expect(formatDuration(1200, { locale: 'zh-CN' })).toBe('1.2秒钟')
    expect(formatDuration(300, { locale: 'en-US' })).toBe('300 milliseconds')
    expect(formatDuration(125_000, { locale: 'zh-CN' })).toBe('2分钟5秒钟')
    // 119.5s must never round up to a "1 分 60 秒" shape.
    expect(formatDuration(119_500, { locale: 'zh-CN' })).toBe('1分钟59秒钟')
  })
})

describe('shared/i18n/format — display names and collation', () => {
  it('localizes region and language names', () => {
    expect(formatDisplayName('region', 'JP', { locale: 'zh-CN' })).toBe('日本')
    expect(formatDisplayName('region', 'JP', { locale: 'en-US' })).toBe('Japan')
    expect(formatDisplayName('language', 'zh', { locale: 'zh-TW' })).toBe('中文')
    expect(formatDisplayName('language', 'en', { locale: 'zh-HK' })).toBe('英文')
  })

  it('handles unknown and malformed codes without throwing', () => {
    // Structurally valid but unassigned region: Intl's localized "unknown" name.
    expect(formatDisplayName('region', 'ZZ', { locale: 'zh-CN' })).toBe('未知地区')
    expect(formatDisplayName('region', 'ZZ', { locale: 'en-US' })).toBe('Unknown Region')
    // Malformed codes return the raw code instead of crashing a render.
    expect(formatDisplayName('region', 'not-a-region', { locale: 'zh-CN' })).toBe('not-a-region')
  })

  it('collates user-visible text per locale', () => {
    expect(compareDisplayText('a', 'b', 'en-US')).toBeLessThan(0)
    expect(compareDisplayText('b', 'a', 'zh-TW')).toBeGreaterThan(0)
    expect(compareDisplayText('a', 'a', 'zh-CN')).toBe(0)
  })

  it('maps every app locale to a date-fns locale', () => {
    expect(dateFnsLocaleFor('zh-CN').code).toBe('zh-CN')
    expect(dateFnsLocaleFor('zh-HK').code).toBe('zh-HK')
    expect(dateFnsLocaleFor('zh-TW').code).toBe('zh-TW')
    expect(dateFnsLocaleFor('en-US').code).toBe('en-US')
    // Unknown tags fall back to English rather than throwing.
    expect(dateFnsLocaleFor('fr-FR').code).toBe('en-US')
  })
})
