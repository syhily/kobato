import type { AppLocale } from '@/shared/i18n/locales'

import { formatDateTime, formatNumber } from '@/shared/i18n/format'
import { MAX_TTL_HOURS, MIN_TTL_HOURS, SECONDS_PER_HOUR } from '@/ui/admin/settings/cache/cache-constants'

// Render the stored TTL in the most readable unit — sub-hour values keep their
// own units. The unit label comes from Intl (`30分钟` / `30 minutes`), never
// from concatenated copy.
export function formatTtl(seconds: number, options: { locale: AppLocale }): string {
  const { locale } = options
  if (seconds < SECONDS_PER_HOUR) {
    if (seconds % 60 === 0) {
      return formatNumber(seconds / 60, { locale, style: 'unit', unit: 'minute', unitDisplay: 'long' })
    }
    return formatNumber(seconds, { locale, style: 'unit', unit: 'second', unitDisplay: 'long' })
  }
  const totalHours = Math.round(seconds / SECONDS_PER_HOUR)
  if (totalHours >= 24 && totalHours % 24 === 0) {
    return formatNumber(totalHours / 24, { locale, style: 'unit', unit: 'day', unitDisplay: 'long' })
  }
  return formatNumber(totalHours, { locale, style: 'unit', unit: 'hour', unitDisplay: 'long' })
}

/** Format an absolute instant in the SITE time zone + active locale (explicit on both axes). */
export function formatTimestamp(iso: string, options: { locale: AppLocale; timeZone: string }): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return formatDateTime(date, { locale: options.locale, timeZone: options.timeZone })
}

export function hoursToSeconds(hours: number): number {
  return Math.max(MIN_TTL_HOURS, Math.min(MAX_TTL_HOURS, Math.trunc(hours))) * SECONDS_PER_HOUR
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min
  }
  return Math.max(min, Math.min(max, value))
}
