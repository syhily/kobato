import { format, isValid, parse } from 'date-fns'
import { HTTPException } from 'hono/http-exception'

import type { Database } from '@/server/infra/db/database'
import type { BlogSettingsBundle } from '@/shared/config/types'
import type { AppLocale } from '@/shared/i18n/locales'

import { through } from '@/server/infra/cache/registry'
import { contentEtag, etagHeaderMatches } from '@/server/infra/http/etag'
import { pngResponse } from '@/server/infra/http/status'
import { type CalendarTheme, renderCalendar } from '@/server/render/calendar/render'
import { APP_VERSION } from '@/shared/config/version'

/** Stored, revalidated on every reuse — a locale switch must never serve the old language. */
export const CALENDAR_CACHE_CONTROL = 'public, no-cache'

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
  db: Database,
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

  // `time` is `MMdd`; the round-trip equality check rejects values the
  // parser would silently roll over (month 13 → next year's January).
  const rawDate = `${year}-${time}`
  const date = parse(rawDate, 'yyyy-MMdd', new Date())
  if (!isValid(date) || format(date, 'yyyy-MMdd') !== rawDate) {
    httpNotFound()
  }

  const { theme, locale, settingsRevision, settings, ifNoneMatch } = options
  const buffer = await through(
    db,
    'calendar',
    { date: format(date, 'yyyy-MM-dd'), theme, locale, version: APP_VERSION, settingsRevision },
    () => renderCalendar(date, theme, locale, settings),
  )

  // ETag over the exact PNG bytes: a cache hit reuses the same buffer, so the
  // tag is stable without regenerating the localized render.
  const etag = contentEtag(buffer)
  const headers = new Headers({
    'Cache-Control': CALENDAR_CACHE_CONTROL,
    'Content-Language': locale,
    ETag: etag,
  })
  if (etagHeaderMatches(ifNoneMatch, etag)) {
    // 304: the same headers advertise the representation just validated — no
    // body, no render, no stale language.
    return new Response(null, { status: 304, headers })
  }
  return pngResponse(buffer, headers)
}
