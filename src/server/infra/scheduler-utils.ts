import { TZDate } from '@date-fns/tz'
import { addDays, addMonths, isAfter } from 'date-fns'

import { DomainError } from '@/server/infra/http/errors'

export function computeNextRun(
  settings: {
    frequency: 'daily' | 'weekly' | 'monthly'
    hour: number
    minute: number
    dayOfWeek?: number
    dayOfMonth?: number
  },
  timeZone: string,
  now: Date,
): Date {
  const tzNow = new TZDate(now, timeZone)

  if (settings.frequency === 'daily') {
    let candidate = new TZDate(
      tzNow.getFullYear(),
      tzNow.getMonth(),
      tzNow.getDate(),
      settings.hour,
      settings.minute,
      0,
      0,
      timeZone,
    )
    if (!isAfter(candidate, tzNow)) {
      candidate = addDays(candidate, 1)
    }
    return candidate
  }

  if (settings.frequency === 'weekly') {
    if (typeof settings.dayOfWeek !== 'number' || settings.dayOfWeek < 1 || settings.dayOfWeek > 7) {
      throw new DomainError('BAD_REQUEST', '每周备份必须指定 1–7 的星期几。')
    }
    const jsDay = settings.dayOfWeek === 7 ? 0 : settings.dayOfWeek
    let candidate = new TZDate(
      tzNow.getFullYear(),
      tzNow.getMonth(),
      tzNow.getDate(),
      settings.hour,
      settings.minute,
      0,
      0,
      timeZone,
    )
    const currentJsDay = candidate.getDay()
    let daysUntil = (jsDay - currentJsDay + 7) % 7
    if (daysUntil === 0 && !isAfter(candidate, tzNow)) {
      daysUntil = 7
    }
    candidate = addDays(candidate, daysUntil)
    return candidate
  }

  // monthly
  if (typeof settings.dayOfMonth !== 'number' || settings.dayOfMonth < 1 || settings.dayOfMonth > 31) {
    throw new DomainError('BAD_REQUEST', '每月备份必须指定 1–31 的日期。')
  }
  let candidate = new TZDate(
    tzNow.getFullYear(),
    tzNow.getMonth(),
    settings.dayOfMonth,
    settings.hour,
    settings.minute,
    0,
    0,
    timeZone,
  )
  if (!isAfter(candidate, tzNow)) {
    candidate = addMonths(candidate, 1)
  }
  return candidate
}
