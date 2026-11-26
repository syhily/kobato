import type { EntityTarget } from '@kobato/db/sqlite/target'
import type { RawAccessEvent } from '@kobato/server/domains/analytics/types'
import type { RequestFacts } from '@kobato/server/infra/http/request-facts'

import { isBot } from '@kobato/api/client/is-bot'
import { buildDeviceEnvServerRow, enrichEvent } from '@kobato/server/domains/analytics/enrich'
import { pushAccessEvent } from '@kobato/server/domains/analytics/services/batcher'
import { bumpPageView } from '@kobato/server/domains/analytics/services/pv-batcher'
import { getLogger } from '@kobato/server/infra/logger'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'

const log = getLogger('analytics.track')

const inflightTracks = new Set<Promise<void>>()

function isPrefetch(facts: RequestFacts): boolean {
  return facts.purpose?.toLowerCase().includes('prefetch') ?? false
}

async function enrichAndPush(raw: RawAccessEvent): Promise<void> {
  try {
    const event = await enrichEvent(raw)
    pushAccessEvent({ event, envServer: buildDeviceEnvServerRow(raw) })
  } catch (err) {
    log.error('trackPageView failed', { err: err instanceof Error ? err.message : String(err) })
  }
}

function schedule(raw: RawAccessEvent): void {
  const pending = enrichAndPush(raw)
  inflightTracks.add(pending)
  void pending.finally(() => inflightTracks.delete(pending))
}

export async function flushTrackedEvents(): Promise<void> {
  while (inflightTracks.size > 0) {
    await Promise.allSettled(inflightTracks)
  }
}

export interface TrackPageViewOptions {
  eventId?: string
  now?: Date
  skipBotFilter?: boolean
  isAdmin?: boolean
  clientAddress?: string
}

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
