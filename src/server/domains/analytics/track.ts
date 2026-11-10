import type { RawAccessEvent } from '@/server/domains/analytics/types'
import type { EntityTarget } from '@/server/infra/db/target'
import type { RequestFacts } from '@/server/infra/http/request-facts'

import { buildDeviceEnvServerRow, enrichEvent } from '@/server/domains/analytics/enrich'
import { pushAccessEvent } from '@/server/domains/analytics/services/batcher'
import { bumpPageView } from '@/server/domains/analytics/services/pv-batcher'
import { getLogger } from '@/server/infra/logger'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { isBot } from '@/shared/utils/is-bot'

// Single owner of "what counts as a view": one call fans out to the per-entity
// counter and the time-series access log. Every gate is synchronous; only the
// enrich → push tail is async, so the caller gets the event id (the client
// beacon's join key) back immediately.

const log = getLogger('analytics.track')

/** In-flight enrich → push chains, so tests can settle them deterministically. */
const inflightTracks = new Set<Promise<void>>()

function isPrefetch(facts: RequestFacts): boolean {
  return facts.purpose?.toLowerCase().includes('prefetch') ?? false
}

async function enrichAndPush(raw: RawAccessEvent): Promise<void> {
  try {
    const event = await enrichEvent(raw)
    pushAccessEvent({ event, envServer: buildDeviceEnvServerRow(raw) })
  } catch (err) {
    // An analytics failure must never break the user-facing request.
    log.error('trackPageView failed', { err: err instanceof Error ? err.message : String(err) })
  }
}

function schedule(raw: RawAccessEvent): void {
  const pending = enrichAndPush(raw)
  inflightTracks.add(pending)
  void pending.finally(() => inflightTracks.delete(pending))
}

/** Test seam: await every in-flight enrich → push chain. */
export async function flushTrackedEvents(): Promise<void> {
  while (inflightTracks.size > 0) {
    await Promise.allSettled(inflightTracks)
  }
}

export interface TrackPageViewOptions {
  /** Tests only: override the request's minted event id. */
  eventId?: string
  now?: Date
  /** Skip the bot check (tests only). */
  skipBotFilter?: boolean
  /** Admin visits are skipped unless `trackAdmin` is on. */
  isAdmin?: boolean
  clientAddress?: string
}

/**
 * Record a page view. Returns the event id the server-side row will carry
 * (and the client beacon must echo), or `null` when a gate dropped the
 * visit — a bot filtered by the bot gate also gets `null` even though the
 * counter may already have bumped.
 */
export function trackPageView(
  facts: RequestFacts,
  target: EntityTarget | null,
  options: TrackPageViewOptions = {},
): string | null {
  try {
    const bundle = getBlogSettingsBundleSync()
    const analytics = bundle?.analytics?.analytics ?? { trackAdmin: false, keepBotRows: false }

    if (options.isAdmin && !analytics.trackAdmin) {
      return null
    }
    if (isPrefetch(facts)) {
      return null
    }

    if (target !== null) {
      bumpPageView(target)
    }

    const ip = options.clientAddress ?? 'unknown'
    const ua = facts.userAgent ?? ''

    // Bot gate BEFORE enrichment: rows `keepBotRows` would drop anyway must
    // not pay for the GeoIP lookup + salted IP hash.
    if (isBot(ua) && !analytics.keepBotRows && !options.skipBotFilter) {
      return null
    }

    const eventId = options.eventId ?? facts.analyticsEventId
    schedule({
      eventId,
      ts: options.now ?? new Date(),
      ip,
      ua,
      clientHints: facts.clientHints,
      path: facts.path,
      referer: facts.referer,
      acceptLanguage: facts.acceptLanguage,
      target,
    })
    return eventId
  } catch (err) {
    log.error('trackPageView failed', { err: err instanceof Error ? err.message : String(err) })
    return null
  }
}
