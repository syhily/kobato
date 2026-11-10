// Editor wall-clock formatting: the BROWSER-LOCAL wall-clock parts are
// normalized onto UTC and formatted in UTC, so SSR and the first client render
// agree on any host. The zone is fixed, never the site zone.

import type { AppLocale } from '@/shared/i18n/locales'

import { formatDate, formatDateTime } from '@/shared/i18n/format'
import { calendarWallClockDate } from '@/ui/components/calendar'

export const WALL_CLOCK_ZONE = 'Etc/UTC'

/** Wall-clock parts normalized onto UTC, so the rendered text is host-zone independent. */
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

/** Wall-clock date + time in the fixed wall-clock zone — identical on server and client. */
export function formatWallClockDateTime(date: Date, locale: AppLocale): string {
  return formatDateTime(wallClockInstant(date), { locale, timeZone: WALL_CLOCK_ZONE })
}

export function formatWallClockMonth(date: Date, locale: AppLocale): string {
  return formatDate(calendarWallClockDate(date), { locale, timeZone: WALL_CLOCK_ZONE, month: 'long' })
}
