import { format, isValid, parse } from 'date-fns'
import { HTTPException } from 'hono/http-exception'

import type { Database } from '@/server/infra/db/database'

import { through } from '@/server/infra/cache/registry'
import { pngResponse } from '@/server/infra/http/status'
import { type CalendarTheme, renderCalendar } from '@/server/render/calendar/render'

const timeRegex = /^\d{4}$/

// The PNG render is expensive (main-thread canvas + level-9 encode + an
// outbound quote fetch per miss) and each date is persisted to the cache —
// an unbounded year (0000–9999) would open ~3.65M distinct renders. Anything
// outside the supported window answers 404 before any work happens.
const MIN_CALENDAR_YEAR = 1970
const MAX_CALENDAR_YEAR = 2100

// Hono-land 404: `HTTPException` is the only thrown shape `onErrorHandler`
// maps — a raw `Response` escapes as an unhandled rejection → 500.
function httpNotFound(): never {
  throw new HTTPException(404, { message: 'Not Found' })
}

export async function serveCalendar(
  db: Database,
  params: { year?: string; time?: string },
  theme: CalendarTheme,
  responseHeaders: HeadersInit,
): Promise<Response> {
  const { year, time } = params
  if (year === undefined || !timeRegex.test(year) || time === undefined || !timeRegex.test(time)) {
    httpNotFound()
  }

  const yearNum = Number(year)
  if (yearNum < MIN_CALENDAR_YEAR || yearNum > MAX_CALENDAR_YEAR) {
    httpNotFound()
  }

  // `time` is `MMdd`; the round-trip equality check rejects values the
  // parser would silently roll over (month 13 → next year's January).
  const rawDate = `${year}-${time}`
  const date = parse(rawDate, 'yyyy-MMdd', new Date())
  if (!isValid(date) || format(date, 'yyyy-MMdd') !== rawDate) {
    httpNotFound()
  }

  const buffer = await through(db, 'calendar', { date: format(date, 'yyyy-MM-dd'), theme }, () =>
    renderCalendar(date, theme),
  )

  return pngResponse(buffer, responseHeaders)
}
