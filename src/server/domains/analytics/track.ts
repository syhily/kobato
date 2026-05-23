import type { EntityTarget } from '@/server/infra/db/target'

import { pushAccessEvent } from '@/server/domains/analytics/batcher'
import { enrichEvent } from '@/server/domains/analytics/enrich'
import { ANALYTICS_KEEP_BOT_ROWS, ANALYTICS_TRACK_ADMIN } from '@/server/infra/env'
import { getLogger } from '@/server/infra/logger'
import { getClientAddress } from '@/shared/utils/request'

// Single entry point for every "this request happened" signal. Fire-
// and-forget: callers `void trackAccess(...)` so a slow geo lookup or
// a backed-up batch flush never blocks render.
//
// Bot filter is on by default and lives behind an env flag so a
// debugger can flip it from outside the process. We deliberately do
// NOT also call `bumpPageView()` here even though the analytics plan
// mentions a dual-write contract — the existing call site inside
// `loadDetailPageCritical` (`@/server/http/loaders/comments`) already
// runs for every detail render and predates this pipeline; mirroring
// it here would double-count.

const log = getLogger('analytics.track')

// `false` keeps bot rows in the table; any other value (including
// undefined) keeps the default of stripping bots. The continuous
// aggregates already filter on `is_bot = FALSE` so leaving bot rows
// in is mainly a forensic / debugging affordance.
const KEEP_BOT_ROWS = ANALYTICS_KEEP_BOT_ROWS

const YF_AID_COOKIE = 'yf_aid'

function readVisitorCookie(headers: Headers): string | null {
  const cookie = headers.get('cookie')
  if (!cookie) {
    return null
  }
  const re = new RegExp(`(?:^|;\\s*)${YF_AID_COOKIE}=([^;]+)`)
  const m = cookie.match(re)
  return m ? decodeURIComponent(m[1]!) : null
}

function isPrefetchRequest(request: Request): boolean {
  const purpose = request.headers.get('purpose') ?? request.headers.get('sec-purpose')
  return purpose?.toLowerCase().includes('prefetch') ?? false
}

export interface TrackAccessOptions {
  /** Override the request timestamp; defaults to `new Date()` at call time. */
  now?: Date
  /** Skip the bot check (useful in tests). */
  skipBotFilter?: boolean
  /**
   * Set by callers that have already resolved the session role. Admin
   * visits are skipped by default (matches the `bumpPageView` admin
   * exemption — dashboard owners shouldn't pollute their own visitor
   * metrics). Set `ANALYTICS_TRACK_ADMIN=true` in `.env` to override
   * for local debugging.
   */
  isAdmin?: boolean
}

export async function trackAccess(
  request: Request,
  target: EntityTarget | null,
  options: TrackAccessOptions = {},
): Promise<void> {
  try {
    if (options.isAdmin && !ANALYTICS_TRACK_ADMIN) {
      return
    }
    if (isPrefetchRequest(request)) {
      return
    }
    const ip = getClientAddress(request)
    const url = new URL(request.url)
    const event = await enrichEvent({
      ts: options.now ?? new Date(),
      ip,
      ua: request.headers.get('user-agent') ?? '',
      path: url.pathname,
      referer: request.headers.get('referer'),
      acceptLanguage: request.headers.get('accept-language'),
      target,
      sessionId: readVisitorCookie(request.headers),
    })

    if (event.isBot && !KEEP_BOT_ROWS && !options.skipBotFilter) {
      return
    }

    pushAccessEvent(event)
  } catch (err) {
    // An analytics failure must never break the user-facing request.
    // Matches Sink's defensive try/catch around its own access log
    // (`server/middleware/1.redirect.ts:148-152`).
    log.error('trackAccess failed', { err: err instanceof Error ? err.message : String(err) })
  }
}

export { YF_AID_COOKIE }
