import type { EntityTarget } from '@/server/infra/db/target'
import type { RequestFacts } from '@/server/infra/http/request-facts'

import { enrichEvent } from '@/server/domains/analytics/enrich'
import { pushAccessEvent } from '@/server/domains/analytics/services/batcher'
import { bumpPageView } from '@/server/domains/analytics/services/pv-batcher'
import { getLogger } from '@/server/infra/logger'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { isBot } from '@/shared/utils/is-bot'

// Single owner of "what counts as a view": one call fans out to the
// per-entity counter and the time-series access log. Prefetch and admin
// visits (unless `trackAdmin`) never write; bots land in the time-series
// only when `keepBotRows` is on. Callers `void` the promise — fire-and-forget.

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
   * Pre-resolved session role; admin visits are skipped unless
   * "记录管理员访问" (`trackAdmin`) is on. Covers BOTH signals.
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

    // Counter signal — the gates above have already passed.
    if (target !== null) {
      bumpPageView(target)
    }

    const ip = options.clientAddress ?? 'unknown'
    const ua = facts.userAgent ?? ''

    // Bot gate BEFORE enrichment: rows `keepBotRows` would drop anyway
    // must not pay for the GeoIP lookup + salted IP hash.
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
    log.error('trackPageView failed', { err: err instanceof Error ? err.message : String(err) })
  }
}

export { KOBATO_AID_COOKIE }
