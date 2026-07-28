import { format, isValid, parse } from 'date-fns'

import type { Database } from '@/server/infra/db/database'

import { through } from '@/server/infra/cache/registry'
import { notFound, pngResponse } from '@/server/infra/http/status'
import { type CalendarTheme, renderCalendar } from '@/server/render/calendar/render'

const timeRegex = /^\d{4}$/

export async function serveCalendar(
  db: Database,
  params: { year?: string; time?: string },
  theme: CalendarTheme,
  responseHeaders: HeadersInit,
): Promise<Response> {
  const { year, time } = params
  if (year === undefined || !timeRegex.test(year) || time === undefined || !timeRegex.test(time)) {
    notFound()
  }

  // `time` is `MMdd`, e.g. `0424`. Reassemble into the full string
  // and parse it through date-fns — the round-trip equality check
  // (`format(date) === rawDate`) catches any value the parser would
  // silently accept by rolling over (e.g. month 13 → next year's
  // January) and rejects with a 404 instead of returning a different
  // calendar than the URL asked for.
  const rawDate = `${year}-${time}`
  const date = parse(rawDate, 'yyyy-MMdd', new Date())
  if (!isValid(date) || format(date, 'yyyy-MMdd') !== rawDate) {
    notFound()
  }

  const buffer = await through(db, 'calendar', { date: format(date, 'yyyy-MM-dd'), theme }, () =>
    renderCalendar(date, theme),
  )

  return pngResponse(buffer, responseHeaders)
}
