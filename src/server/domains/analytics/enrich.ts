import { createHash } from 'node:crypto'
import { UAParser } from 'ua-parser-js'
import { CLIs, Crawlers, Emails, ExtraDevices, Fetchers, InApps, MediaPlayers, Vehicles } from 'ua-parser-js/extensions'

import type { EnrichedAccessEvent, RawAccessEvent } from '@/server/domains/analytics/types'

import { lookupCity } from '@/server/domains/analytics/geoip'
import { getDailySalt } from '@/server/domains/analytics/salt'
import { isBot } from '@/shared/utils/is-bot'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

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

// ua-parser-js v2 extension packs merged into the browser/device regex
// maps (the constructor merges per key): crawlers/fetchers/CLIs gain a
// `browser.type`, extra devices a `device.type`. The packs' public typing
// is an opaque union, so the merge boundary casts once.
interface UaExtensionPack {
  browser?: unknown[]
  device?: unknown[]
}

const browserPacks = unsafeCast<UaExtensionPack[]>([Crawlers, CLIs, Emails, Fetchers, InApps, MediaPlayers, Vehicles])
const devicePacks = unsafeCast<UaExtensionPack[]>([ExtraDevices])

type UaExtensions = UAParser.UAParserExt

const UA_EXTENSIONS = unsafeCast<UaExtensions>({
  browser: browserPacks.flatMap((pack) => pack.browser ?? []),
  device: devicePacks.flatMap((pack) => pack.device ?? []),
})

// The constructor merges the extension packs into the regex maps — do it
// once. A parser instance carries no cross-parse state: getResult() builds
// fresh UAItems from the current setUA() string, and parseUserAgent runs
// both synchronously, so concurrent enrichEvent calls cannot interleave.
const UA_PARSER = new UAParser(UA_EXTENSIONS)

function parseUserAgent(ua: string) {
  if (!ua) {
    return { os: null, browser: null, browserType: null, device: null, deviceType: null }
  }
  const info = UA_PARSER.setUA(ua).getResult()
  return {
    os: info.os?.name ?? null,
    browser: info.browser?.name ?? null,
    browserType: info.browser?.type ?? null,
    device: info.device?.model ?? null,
    deviceType: info.device?.type ?? null,
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

  const parsed = parseUserAgent(ua)

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
    // Primary gate stays the hand-rolled matcher; ua-parser's
    // crawler/fetcher browserType is the secondary signal.
    isBot: isBot(ua) || ['crawler', 'fetcher'].includes(parsed.browserType ?? ''),
  }
}
