import type { TimeUnit } from '@/shared/contracts/analytics'

// ViewsPoint.time is a bucket LABEL in clientTimezone, not an ISO instant:
// minute '%Y-%m-%d %H:%M', hour '%Y-%m-%d %H', day '%Y-%m-%d'. These helpers
// parse labels back to local-time timestamps (chart x values) and format
// them for tooltips / summaries. Pure functions shared by the chart inner
// bundle, the welcome card aggregation, and the unit tests.

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

/** Human-readable label for tooltips and screen-reader summaries (zh-CN). */
export function formatTimeLabel(unit: TimeUnit, label: string): string {
  const ts = parseTimeLabel(unit, label)
  if (!Number.isFinite(ts)) {
    return label
  }
  return new Intl.DateTimeFormat(
    'zh-CN',
    unit === 'day' ? { dateStyle: 'medium' } : { dateStyle: 'short', timeStyle: 'short' },
  ).format(ts)
}

/** First day key (`%Y-%m-%d`) of a bucket label — works for every unit. */
export function dayKeyOfLabel(label: string): string {
  return label.slice(0, 10)
}
