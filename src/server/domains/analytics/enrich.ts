import { isbot } from 'isbot'
import { createHash } from 'node:crypto'

import type { EnrichedAccessEvent, RawAccessEvent } from '@/server/domains/analytics/types'

import { lookupCity } from '@/server/domains/analytics/geoip'
import { getDailySalt } from '@/server/domains/analytics/salt'

// Take a raw request signal and produce a row-shaped event ready for
// the COPY pipeline. Pure async work — never touches the request /
// response objects after this returns. All failures degrade to null
// fields rather than throwing.

function hashIp(ip: string): string {
  // SHA-256 truncated to 32 hex chars. 128 bits of state in a 32-byte
  // text column is still well below the SHA-256 collision floor at
  // the data volumes a personal blog produces, and the visitor table
  // index is materially smaller than a full 64-char hash.
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

// Minimal `Accept-Language` first-tag parser. The header is
// comma-separated quality-weighted tags
// (`zh-CN,zh;q=0.9,en;q=0.8`). The dashboard only cares about the
// primary preference, so first tag wins. Empty / malformed input
// returns `null` — same null-degrade behaviour as every other
// enrichment column. Dropping the `intl-parse-accept-language` dep
// (the plan's original choice) saves ~25KB of runtime for what is
// effectively `split(',')[0]`.
function parsePrimaryLanguage(header: string | null): string | null {
  if (!header) {
    return null
  }
  const first = header.split(',')[0]?.split(';')[0]?.trim()
  return first ? first : null
}

function isBotUa(ua: string): boolean {
  if (!ua) {
    return false
  }
  return isbot(ua)
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

  return {
    ts: raw.ts,
    visitorHash: hashIp(raw.ip),
    sessionId: raw.sessionId,
    // Privacy: raw IP is used for geo lookup but not persisted.
    // Only the salted visitorHash is stored for analytics.
    ip: null,
    path: raw.path,
    entityType: raw.target?.type ?? null,
    entityId: raw.target?.ownerId ?? null,
    referer: raw.referer,
    refererHost: parseRefererHost(raw.referer),
    country,
    region,
    city,
    latitude,
    longitude,
    timezone,
    language,
    ua: ua || null,
    browser: null,
    browserVersion: null,
    os: null,
    osVersion: null,
    device: null,
    deviceType: null,
    isBot: isBotUa(ua),
  }
}
