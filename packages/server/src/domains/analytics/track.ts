import type { EntityTarget } from '@kobato/server/infra/db/target'
import type { RequestFacts } from '@kobato/server/infra/http/request-facts'

import { enrichEvent } from '@kobato/server/domains/analytics/enrich'
import { pushAccessEvent } from '@kobato/server/domains/analytics/services/batcher'
import { bumpPageView } from '@kobato/server/domains/analytics/services/pv-batcher'
import { getLogger } from '@kobato/server/infra/logger'
import { getBlogSettingsBundleSync } from '@kobato/shared/config/getters'
import { isBot } from '@kobato/shared/utils/is-bot'

// Single owner of "what counts as a view" for the whole analytics domain.
// Callers fire `void trackPageView(facts, target, options)` and the gate
// here decides whether EITHER signal writes:
//   - prefetch requests (via `facts.purpose`) never write anything;
//   - admin visits are skipped unless "记录管理员访问" (`trackAdmin`) is
//     toggled on in `/admin/settings` — the same rule covers BOTH signals;
//   - bot traffic still bumps the counter (counters carry no bot
//     dimension) but only lands in the time-series when `keepBotRows` is on.
// Settings come from the `blog.analytics` section, falling back to safe
// defaults (`trackAdmin: false`, `keepBotRows: false`) when unseeded.
//
// One call fans out to both signals: the per-entity counter
// (`bumpPageView`, skipped when `target` is null — e.g. the homepage,
// which has no entity to count) and the time-series access log
// (`pushAccessEvent`). Fire-and-forget: callers `void` the promise so
// enrichment/flush never blocks render.

const log = getLogger('analytics.track')

const KOBATO_AID_COOKIE = 'kobato_aid'

function readVisitorCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) {
    return null
  }
  const re = new RegExp(`(?:^|;\\s*)${KOBATO_AID_COOKIE}=([^;]+)`)
  const m = cookieHeader.match(re)
  return m ? decodeURIComponent(m[1]!) : null
}

function isPrefetch(facts: RequestFacts): boolean {
  return facts.purpose?.toLowerCase().includes('prefetch') ?? false
}

export interface TrackPageViewOptions {
  /** Override the request timestamp; defaults to `new Date()` at call time. */
  now?: Date
  /** Skip the bot check (useful in tests). */
  skipBotFilter?: boolean
  /**
   * Set by callers that have already resolved the session role. Admin
   * visits are skipped by default — dashboard owners shouldn't pollute
   * their own visitor metrics. Toggle "记录管理员访问" in
   * `/admin/settings` to override; the toggle covers BOTH signals.
   */
  isAdmin?: boolean
  /**
   * Pre-resolved client address from the Hono middleware context.
   * Falls back to `'unknown'` when not provided.
   */
  clientAddress?: string
}

export async function trackPageView(
  facts: RequestFacts,
  target: EntityTarget | null,
  options: TrackPageViewOptions = {},
): Promise<void> {
  try {
    const bundle = getBlogSettingsBundleSync()
    const analytics = bundle?.analytics?.analytics ?? { trackAdmin: false, keepBotRows: false }

    if (options.isAdmin && !analytics.trackAdmin) {
      return
    }
    if (isPrefetch(facts)) {
      return
    }

    // Counter signal — the gate above has already passed, so this fires
    // for every countable view. A null target (e.g. the homepage) has no
    // entity to count and only lands in the time-series below.
    if (target !== null) {
      bumpPageView(target)
    }

    const ip = options.clientAddress ?? 'unknown'
    const ua = facts.userAgent ?? ''

    // Bot gate BEFORE enrichment: a row keepBotRows would drop anyway
    // must not pay for the GeoIP lookup + salted IP hash. The counter
    // above already fired (counters carry no bot dimension), and when
    // keepBotRows is on the row is still enriched and stored below.
    if (isBot(ua) && !analytics.keepBotRows && !options.skipBotFilter) {
      return
    }

    const event = await enrichEvent({
      ts: options.now ?? new Date(),
      ip,
      ua,
      path: facts.path,
      referer: facts.referer,
      acceptLanguage: facts.acceptLanguage,
      target,
      sessionId: readVisitorCookie(facts.cookie),
    })

    pushAccessEvent(event)
  } catch (err) {
    // An analytics failure must never break the user-facing request.
    // Matches Sink's defensive try/catch around its own access log
    // (`server/middleware/1.redirect.ts:148-152`).
    log.error('trackPageView failed', { err: err instanceof Error ? err.message : String(err) })
  }
}

export { KOBATO_AID_COOKIE }
