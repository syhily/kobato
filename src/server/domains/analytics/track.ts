import type { EntityTarget } from '@/server/infra/db/target'

import { enrichEvent } from '@/server/domains/analytics/enrich'
import { pushAccessEvent } from '@/server/domains/analytics/repos/batcher'
import { getLogger } from '@/server/infra/logger'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { getClientAddress } from '@/shared/utils/request'

// Single entry point for every "this request happened" signal. Fire-
// and-forget: callers `void trackAccess(...)` so a slow geo lookup or
// a backed-up batch flush never blocks render.
//
// Bot filter and admin-exemption are driven by the `analytics` settings
// section (`blog.analytics`). If the section has not been seeded yet
// (e.g. a deployment upgraded before the backfill runs), both toggles
// fall back to their safe defaults (`trackAdmin: false`,
// `keepBotRows: false`) so the access-log pipeline never breaks.
//
// We deliberately do NOT also call `bumpPageView()` here even though
// the analytics plan mentions a dual-write contract — the existing call
// site inside `loadDetailPageCritical`
// (`@/server/http/loaders/comments`) already runs for every detail
// render and predates this pipeline; mirroring it here would double-count.

const log = getLogger('analytics.track')

const KOBATO_AID_COOKIE = 'kobato_aid'

function readVisitorCookie(headers: Headers): string | null {
  const cookie = headers.get('cookie')
  if (!cookie) {
    return null
  }
  const re = new RegExp(`(?:^|;\\s*)${KOBATO_AID_COOKIE}=([^;]+)`)
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
   * metrics). Toggle "记录管理员访问" in `/admin/settings` to override.
   */
  isAdmin?: boolean
}

export async function trackAccess(
  request: Request,
  target: EntityTarget | null,
  options: TrackAccessOptions = {},
): Promise<void> {
  try {
    const bundle = getBlogSettingsBundleSync()
    const analytics = bundle?.analytics?.analytics ?? { trackAdmin: false, keepBotRows: false }

    if (options.isAdmin && !analytics.trackAdmin) {
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

    if (event.isBot && !analytics.keepBotRows && !options.skipBotFilter) {
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

export { KOBATO_AID_COOKIE }
