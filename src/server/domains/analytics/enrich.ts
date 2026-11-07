import { createHash } from 'node:crypto'

import type { EnrichedAccessEvent, RawAccessEvent } from '@/server/domains/analytics/types'

import { lookupCity } from '@/server/domains/analytics/geoip'
import { getDailySalt } from '@/server/domains/analytics/salt'
import { parseUaFields } from '@/server/domains/analytics/ua-parse'
import { isBot } from '@/shared/utils/is-bot'

// Row-shaped event for the append pipeline: never touches request/response
// objects; failures degrade to null fields rather than throwing.

function hashIp(ip: string): string {
  // SHA-256 truncated to 32 hex chars — collision-safe at personal-blog volumes.
  return createHash('sha256')
    .update(ip + getDailySalt())
    .digest('hex')
    .slice(0, 32)
}

function parseRefererHost(referer: string | null): string | null {
  if (!referer) {
    return null
  }
  try {
    return new URL(referer).host || null
  } catch {
    return null
  }
}

// Data minimisation: the raw referer can carry tokens in its query and
// is persisted for months — strip query/hash/userinfo before storage.
function minimizeReferer(referer: string | null): string | null {
  if (!referer) {
    return null
  }
  try {
    const url = new URL(referer)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

// The dashboard only cares about the primary preference; empty/malformed input degrades to `null`.
function parsePrimaryLanguage(header: string | null): string | null {
  if (!header) {
    return null
  }
  const first = header.split(',')[0]?.split(';')[0]?.trim()
  return first ? first : null
}

export async function enrichEvent(raw: RawAccessEvent): Promise<EnrichedAccessEvent> {
  const ua = raw.ua ?? ''
  const language = parsePrimaryLanguage(raw.acceptLanguage)
  const geo = raw.ip ? await lookupCity(raw.ip) : null

  const country = geo?.country?.isoCode ?? geo?.registeredCountry?.isoCode ?? null
  const region = geo?.subdivisions?.[0]?.names?.en ?? null
  const city = geo?.city?.names?.en ?? null
  const latitude = geo?.location?.latitude ?? null
  const longitude = geo?.location?.longitude ?? null
  const timezone = geo?.location?.timeZone ?? null

  const parsed = parseUaFields(ua, raw.clientHints ?? undefined)

  return {
    ts: raw.ts,
    visitorHash: hashIp(raw.ip),
    // Privacy: the raw IP feeds the geo lookup and the salted hash but is
    // never persisted — only the daily-salted visitorHash is stored.
    path: raw.path,
    entityType: raw.target?.type ?? null,
    entityId: raw.target?.ownerId ?? null,
    referer: minimizeReferer(raw.referer),
    refererHost: parseRefererHost(raw.referer),
    country,
    region,
    city,
    latitude,
    longitude,
    timezone,
    language,
    ua: ua || null,
    ...parsed,
    // Primary gate stays the hand-rolled matcher; node-device-detector's
    // bot/feed-reader classification is the secondary signal.
    isBot: isBot(ua) || ['crawler', 'fetcher'].includes(parsed.browserType ?? ''),
  }
}
