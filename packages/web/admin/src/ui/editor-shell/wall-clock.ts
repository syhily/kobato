// Editor wall-clock formatting: the BROWSER-LOCAL wall-clock parts are
// normalized onto UTC and formatted in UTC, so SSR and the first client render
// agree on any host. The zone is fixed, never the site zone.

import type { AppLocale } from '@kobato/i18n/locales.ts'

import { calendarWallClockDate } from '@kobato/ui/components/calendar.tsx'
import { formatDate, formatDateTime } from '@kobato/utils/format.ts'

export const WALL_CLOCK_ZONE = 'Etc/UTC'

export function wallClockInstant(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
    ),
  )
}

export function formatWallClockDateTime(date: Date, locale: AppLocale): string {
  return formatDateTime(wallClockInstant(date), { locale, timeZone: WALL_CLOCK_ZONE })
}

export function formatWallClockMonth(date: Date, locale: AppLocale): string {
  return formatDate(calendarWallClockDate(date), { locale, timeZone: WALL_CLOCK_ZONE, month: 'long' })
}
