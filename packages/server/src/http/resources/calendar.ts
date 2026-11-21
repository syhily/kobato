import type { AppLocale } from '@kobato/i18n/locales'
import type { BlogSettingsBundle } from '@kobato/settings/types'

import { APP_VERSION } from '@kobato/distribution/app'
import { through } from '@kobato/server/infra/cache/registry'
import { contentEtag, etagHeaderMatches } from '@kobato/server/infra/http/etag'
import { pngResponse } from '@kobato/server/infra/http/status'
import { type CalendarTheme, renderCalendar } from '@kobato/server/render/calendar/render'
import { format, isValid, parse } from 'date-fns'
import { HTTPException } from 'hono/http-exception'

export const CALENDAR_CACHE_CONTROL = 'public, no-cache'

const timeRegex = /^\d{4}$/

const MIN_CALENDAR_YEAR = 1970
const MAX_CALENDAR_YEAR = 2100

function httpNotFound(): never {
  throw new HTTPException(404, { message: 'Not Found' })
}

export interface CalendarRequestOptions {
  theme: CalendarTheme
  /** The request's AppLocale — explicit, never inferred from the cache key. */
  locale: AppLocale
  /** The pinned settings generation — part of the cache key, not of the renderer input. */
  settingsRevision: string
  /** The request's pinned settings bundle (daily-quote source & custom bank). */
  settings: BlogSettingsBundle | null
  ifNoneMatch: string | null
}

export async function serveCalendar(
  params: { year?: string; time?: string },
  options: CalendarRequestOptions,
): Promise<Response> {
  const { year, time } = params
  if (year === undefined || !timeRegex.test(year) || time === undefined || !timeRegex.test(time)) {
    httpNotFound()
  }

  const yearNum = Number(year)
  if (yearNum < MIN_CALENDAR_YEAR || yearNum > MAX_CALENDAR_YEAR) {
    httpNotFound()
  }

  const rawDate = `${year}-${time}`
  const date = parse(rawDate, 'yyyy-MMdd', new Date())
  if (!isValid(date) || format(date, 'yyyy-MMdd') !== rawDate) {
    httpNotFound()
  }

  const { theme, locale, settingsRevision, settings, ifNoneMatch } = options
  const buffer = await through(
    'calendar',
    { date: format(date, 'yyyy-MM-dd'), theme, locale, version: APP_VERSION, settingsRevision },
    () => renderCalendar(date, theme, locale, settings),
  )

  const etag = contentEtag(buffer)
  const headers = new Headers({
    'Cache-Control': CALENDAR_CACHE_CONTROL,
    'Content-Language': locale,
    ETag: etag,
  })
  if (etagHeaderMatches(ifNoneMatch, etag)) {
    return new Response(null, { status: 304, headers })
  }
  return pngResponse(buffer, headers)
}
