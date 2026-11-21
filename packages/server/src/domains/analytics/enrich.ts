import type { EnrichedAccessEvent } from '@kobato/db/duckdb/access-events'
import type { DeviceEnvServerRow } from '@kobato/db/duckdb/device-env'
import type { RawAccessEvent } from '@kobato/server/domains/analytics/types'

import { lookupCity } from '@kobato/server/domains/analytics/geoip/lookup'
import { getDailySalt } from '@kobato/server/domains/analytics/salt'
import { parseUaFields } from '@kobato/server/domains/analytics/ua-parse'
import { isBot } from '@kobato/server/infra/http/is-bot'
import { createHash } from 'node:crypto'

function hashIp(ip: string): string {
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

function parseMobileHint(mobile: string | null | undefined): boolean | null {
  if (mobile === '?1') {
    return true
  }
  if (mobile === '?0') {
    return false
  }
  return null
}

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
    isBot: isBot(ua) || ['crawler', 'fetcher'].includes(parsed.browserType ?? ''),
  }
}
