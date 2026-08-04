import type { Database } from '@kobato/server/infra/db/database'

import { through } from '@kobato/server/infra/cache/registry'
import { pngResponse } from '@kobato/server/infra/http/png-response'
import { type CalendarTheme, renderCalendar } from '@kobato/server/render/calendar/render'
import { format, isValid, parse } from 'date-fns'
import { HTTPException } from 'hono/http-exception'

const timeRegex = /^\d{4}$/

// Hono-land 404: `HTTPException` is the only thrown shape the pipeline's
// error handler maps to a real response (`onErrorHandler`). The RR-style
// `notFound()` helper throws a raw `Response`, which Hono does NOT catch
// — it escapes as an unhandled rejection and surfaces as a 500.
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

  // `time` is `MMdd`, e.g. `0424`. Reassemble into the full string
  // and parse it through date-fns — the round-trip equality check
  // (`format(date) === rawDate`) catches any value the parser would
  // silently accept by rolling over (e.g. month 13 → next year's
  // January) and rejects with a 404 instead of returning a different
  // calendar than the URL asked for.
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
