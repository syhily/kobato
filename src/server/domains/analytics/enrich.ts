import { createHash } from 'node:crypto'

import type { EnrichedAccessEvent, RawAccessEvent } from '@/server/domains/analytics/types'

import { lookupCity } from '@/server/domains/analytics/geoip'
import { getDailySalt } from '@/server/domains/analytics/salt'
import { isBot } from '@/shared/utils/is-bot'

// Take a raw request signal and produce a row-shaped event for the COPY
// pipeline. Never touches request/response objects; failures degrade to
// null fields rather than throwing.

function hashIp(ip: string): string {
  // SHA-256 truncated to 32 hex chars — collision-safe at personal-blog
  // volumes and keeps the visitor index smaller than a full 64-char hash.
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

// Data minimisation: the dashboard only reads `referer_host`, yet the raw
// referer can carry tokens in its query and is persisted for months.
// Strip query/hash (and any userinfo) before storage; an unparseable
// referer cannot be inspected, so per this file's degrade-to-null
// convention nothing is persisted.
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

// Minimal `Accept-Language` first-tag parser. The dashboard only cares
// about the primary preference, so first tag wins; empty/malformed input
// degrades to `null` like every other enrichment column.
function parsePrimaryLanguage(header: string | null): string | null {
  if (!header) {
    return null
  }
  const first = header.split(',')[0]?.split(';')[0]?.trim()
  return first ? first : null
}

function isBotUa(ua: string): boolean {
  return isBot(ua)
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
    browser: null,
    browserVersion: null,
    os: null,
    osVersion: null,
    device: null,
    deviceType: null,
    isBot: isBotUa(ua),
  }
}
