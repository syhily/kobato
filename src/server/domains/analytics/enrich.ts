import { createHash } from 'node:crypto'

import type { DeviceEnvServerRow } from '@/server/domains/analytics/services/device-env'
import type { EnrichedAccessEvent, RawAccessEvent } from '@/server/domains/analytics/types'

import { lookupCity } from '@/server/domains/analytics/geoip'
import { getDailySalt } from '@/server/domains/analytics/salt'
import { parseUaFields } from '@/server/domains/analytics/ua-parse'
import { isBot } from '@/shared/utils/is-bot'

function hashIp(ip: string): string {
  // SHA-256 truncated to 32 hex chars; collision-safe at personal-blog volumes.
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

// Raw referer is persisted for months and may carry tokens — strip query/hash/userinfo.
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

function truncated(value: string | null | undefined, max: number): string {
  return (value ?? '').slice(0, max)
}

/** `Sec-CH-UA-Mobile` is a structured boolean (`?1` / `?0`); anything else is "not received". */
function parseMobileHint(mobile: string | null | undefined): boolean | null {
  if (mobile === '?1') {
    return true
  }
  if (mobile === '?0') {
    return false
  }
  return null
}

/**
 * The `device_env_server` half of an access event: UA-CH high-entropy values
 * and the full Accept-Language list. A session's first hits arrive without
 * hints, so strings degrade to '' and `mobile` to NULL rather than being
 * inferred from the UA.
 */
export function buildDeviceEnvServerRow(raw: RawAccessEvent): DeviceEnvServerRow {
  const hints = raw.clientHints
  return {
    eventId: raw.eventId,
    timestamp: raw.ts,
    uaFullVersion: hints?.fullVersion ?? '',
    platform: hints?.platform ?? '',
    platformVersion: hints?.platformVersion ?? '',
    model: hints?.model ?? '',
    mobile: parseMobileHint(hints?.mobile),
    brands: hints?.brands ?? '',
    arch: hints?.arch ?? '',
    bitness: hints?.bitness ?? '',
    formFactors: truncated(hints?.formFactors, 128),
    acceptLanguage: truncated(raw.acceptLanguage, 256),
  }
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
    eventId: raw.eventId,
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
    // Hand-rolled matcher is the primary bot gate; the parser's
    // crawler/fetcher classification is the secondary signal.
    isBot: isBot(ua) || ['crawler', 'fetcher'].includes(parsed.browserType ?? ''),
  }
}
