import type { AppLocale } from '@kobato/i18n/locales'

import { formatDate, formatDateTime } from '@kobato/base/utils/format'
import { calendarWallClockDate } from '@kobato/ui/components/calendar'

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
