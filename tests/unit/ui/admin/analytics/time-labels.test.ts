import { describe, expect, it } from 'vitest'

import { formatTimeLabel, parseTimeLabel } from '@/ui/admin/analytics/time-labels'

// Analytics bucket labels are BROWSER-zoned: the helper must format the parsed
// label in the zone it is handed (the chart passes `getClientTimezone()`), with
// the active UI locale, never a pinned zh-CN.

const HOST_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

function expected(unit: 'hour' | 'day', label: string, locale: string, timeZone: string): string {
  const ts = parseTimeLabel(unit, label)
  const options: Intl.DateTimeFormatOptions =
    unit === 'day' ? { dateStyle: 'medium' } : { dateStyle: 'short', timeStyle: 'short' }
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(ts)
}

describe('ui/admin/analytics/time-labels — browser-zone labels', () => {
  it('formats the bucket in the browser zone with the active locale', () => {
    const label = '2026-03-05 14'
    expect(formatTimeLabel('hour', label, { locale: 'zh-CN', timeZone: HOST_ZONE })).toBe(
      expected('hour', label, 'zh-CN', HOST_ZONE),
    )
    expect(formatTimeLabel('hour', label, { locale: 'en-US', timeZone: HOST_ZONE })).toBe(
      expected('hour', label, 'en-US', HOST_ZONE),
    )
  })

  it('localizes the day bucket (medium date)', () => {
    const label = '2026-03-05'
    expect(formatTimeLabel('day', label, { locale: 'en-US', timeZone: HOST_ZONE })).toBe(
      expected('day', label, 'en-US', HOST_ZONE),
    )
    expect(formatTimeLabel('day', label, { locale: 'zh-CN', timeZone: HOST_ZONE })).toBe(
      expected('day', label, 'zh-CN', HOST_ZONE),
    )
  })

  it('honours an explicitly different zone instead of the host zone', () => {
    // 12:00 in Tokyo is 03:00 UTC — the passed zone decides the clock label.
    const label = '2026-03-05 12'
    expect(formatTimeLabel('hour', label, { locale: 'en-US', timeZone: 'UTC' })).toBe(
      expected('hour', label, 'en-US', 'UTC'),
    )
    expect(formatTimeLabel('hour', label, { locale: 'en-US', timeZone: 'UTC' })).not.toBe(
      formatTimeLabel('hour', label, { locale: 'en-US', timeZone: 'Etc/GMT-9' }),
    )
  })

  it('returns a malformed label verbatim', () => {
    expect(formatTimeLabel('hour', 'not-a-label', { locale: 'en-US', timeZone: HOST_ZONE })).toBe('not-a-label')
  })
})
