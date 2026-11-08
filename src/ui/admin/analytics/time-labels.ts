// ViewsPoint.time is a bucket LABEL in clientTimezone, not an ISO instant:
// minute '%Y-%m-%d %H:%M', hour '%Y-%m-%d %H', day '%Y-%m-%d'. These helpers
// parse labels back to local-time timestamps (chart x values) and format
// them for tooltips / summaries. Pure functions shared by the chart inner
// bundle, the welcome card aggregation, and the unit tests.
//
// Analytics bucketing stays BROWSER-zoned (never the site zone): the chart
// passes `getClientTimezone()` explicitly, and the locale always comes from
// the active UI translator.

import type { TimeUnit } from '@/shared/contracts/analytics'
import type { AppLocale } from '@/shared/i18n/locales'

import { formatDate, formatDateTime } from '@/shared/i18n/format'

/** Parse a bucket label to a LOCAL-time timestamp (ms); NaN when malformed. */
export function parseTimeLabel(unit: TimeUnit, label: string): number {
  if (unit === 'day') {
    return new Date(`${label}T00:00:00`).getTime()
  }
  const [date, time] = label.split(' ')
  if (!date || !time) {
    return Number.NaN
  }
  const normalized = time.includes(':') ? time : `${time.padStart(2, '0')}:00`
  return new Date(`${date}T${normalized}:00`).getTime()
}

export interface TimeLabelOptions {
  /** Active UI locale (never a runtime default). */
  locale: AppLocale
  /** The BROWSER zone the bucket labels were produced in (`getClientTimezone()`). */
  timeZone: string
}

/** Human-readable label for tooltips and screen-reader summaries. */
export function formatTimeLabel(unit: TimeUnit, label: string, options: TimeLabelOptions): string {
  const ts = parseTimeLabel(unit, label)
  if (!Number.isFinite(ts)) {
    return label
  }
  const { locale, timeZone } = options
  const value = new Date(ts)
  return unit === 'day'
    ? formatDate(value, { locale, timeZone, dateStyle: 'medium' })
    : formatDateTime(value, { locale, timeZone, dateStyle: 'short', timeStyle: 'short' })
}

/** First day key (`%Y-%m-%d`) of a bucket label — works for every unit. */
export function dayKeyOfLabel(label: string): string {
  return label.slice(0, 10)
}
