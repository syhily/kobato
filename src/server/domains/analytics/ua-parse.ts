import DeviceDetector from 'node-device-detector'
import ClientHints from 'node-device-detector/client-hints'

// Pure UA → analytics-fields mapping (node-device-detector port). This
// module deliberately has ZERO kobato-internal imports so the offline
// history-repair tooling can import it directly by relative path and
// re-parse stored UAs with the exact production logic.
//
// Field vocabularies continue the ua-parser-js era so historical and new
// rows stay comparable on the dashboard:
// - os/browser names normalized to the historical spellings (macOS, Edge,
//   Mobile Chrome, …) where node-device-detector diverges
// - deviceType: mobile / tablet / desktop / wearable / smarttv / console /
//   embedded — node-device-detector detects `desktop` natively, which the
//   old parser never reported
// - browserType keeps the crawler/fetcher/inapp/email/mediaplayer/library
//   vocabulary the bot gate in `enrich.ts` consumes
// - device is the marketing name ("Samsung Galaxy S20 5G"), never a raw
//   model number, and never ua-parser-js's bogus "Macintosh" / "K"

export interface UaClientHints {
  /** `Sec-CH-UA-Model` — high-entropy, sent only after an `Accept-CH` opt-in. */
  model?: string | null
  /** `Sec-CH-UA-Platform`. */
  platform?: string | null
  /** `Sec-CH-UA-Platform-Version`. */
  platformVersion?: string | null
  /** `Sec-CH-UA-Mobile` (`?1` / `?0`). */
  mobile?: string | null
  /** `Sec-CH-UA-Full-Version-List` (preferred) or `Sec-CH-UA`. */
  brands?: string | null
  /** `Sec-CH-UA-Full-Version`. */
  fullVersion?: string | null
  /** `Sec-CH-UA-Arch`. */
  arch?: string | null
  /** `Sec-CH-UA-Bitness`. */
  bitness?: string | null
  /** `Sec-CH-UA-Form-Factors` (raw header value). */
  formFactors?: string | null
}

export interface ParsedUaFields {
  os: string | null
  browser: string | null
  browserType: string | null
  device: string | null
  deviceType: string | null
}

const OS_NAME_MAP: Record<string, string> = {
  Mac: 'macOS',
  'GNU/Linux': 'Linux',
}

const BROWSER_NAME_MAP: Record<string, string> = {
  'Microsoft Edge': 'Edge',
  'Chrome Mobile': 'Mobile Chrome',
  'Firefox Mobile': 'Mobile Firefox',
  'Chrome Webview': 'Chrome WebView',
}

const DEVICE_TYPE_MAP: Record<string, string> = {
  smartphone: 'mobile',
  phablet: 'mobile',
  'feature phone': 'mobile',
  tablet: 'tablet',
  desktop: 'desktop',
  wearable: 'wearable',
  tv: 'smarttv',
  'smart display': 'smarttv',
  console: 'console',
  'car browser': 'embedded',
  'portable media player': 'embedded',
  camera: 'embedded',
  peripheral: 'embedded',
}

/** node-device-detector client.type → the historical browserType vocabulary. */
function browserTypeOf(clientType: string | null): string | null {
  if (clientType === null) {
    return null
  }
  switch (clientType) {
    case 'feed reader':
      return 'fetcher'
    case 'mobile app':
      return 'inapp'
    case 'pim':
      return 'email'
    case 'mediaplayer':
      return 'mediaplayer'
    case 'library':
      return 'library'
    default:
      return null
  }
}

/** Brand-prefixed marketing model, e.g. "Samsung Galaxy S20 5G". */
function deviceLabel(brand: string, model: string): string {
  if (!brand || brand === 'Apple' || model.startsWith(brand)) {
    return model
  }
  return `${brand} ${model}`
}

const detector = new DeviceDetector({ skipBotDetection: false, osVersionTruncate: null, clientVersionTruncate: null })
const hintsParser = new ClientHints()

function hasHints(hints: UaClientHints | undefined): hints is UaClientHints {
  return (
    !!hints &&
    !!(
      hints.model ||
      hints.platform ||
      hints.platformVersion ||
      hints.mobile ||
      hints.brands ||
      hints.fullVersion ||
      hints.arch ||
      hints.bitness ||
      hints.formFactors
    )
  )
}

function toRawHints(hints: UaClientHints): Record<string, string> {
  const raw: Record<string, string> = {}
  if (hints.model) {
    raw['sec-ch-ua-model'] = hints.model
  }
  if (hints.platform) {
    raw['sec-ch-ua-platform'] = hints.platform
  }
  if (hints.platformVersion) {
    raw['sec-ch-ua-platform-version'] = hints.platformVersion
  }
  if (hints.mobile) {
    raw['sec-ch-ua-mobile'] = hints.mobile
  }
  if (hints.brands) {
    raw['sec-ch-ua-full-version-list'] = hints.brands
  }
  if (hints.fullVersion) {
    raw['sec-ch-ua-full-version'] = hints.fullVersion
  }
  if (hints.arch) {
    raw['sec-ch-ua-arch'] = hints.arch
  }
  if (hints.bitness) {
    raw['sec-ch-ua-bitness'] = hints.bitness
  }
  if (hints.formFactors) {
    raw['sec-ch-ua-form-factors'] = hints.formFactors
  }
  return raw
}

const EMPTY_RESULT: ParsedUaFields = { os: null, browser: null, browserType: null, device: null, deviceType: null }

// UA strings repeat heavily across requests (production: ~2.2k distinct
// values); node-device-detector runs thousands of regexes per parse, so a
// small LRU is the difference between negligible and hot.
const CACHE_CAP = 5000
const cache = new Map<string, ParsedUaFields>()

export function parseUaFields(ua: string, hints?: UaClientHints): ParsedUaFields {
  if (!ua) {
    return EMPTY_RESULT
  }
  const withHints = hasHints(hints) ? hints : undefined
  const cacheKey = withHints ? `${ua}¶${JSON.stringify(toRawHints(withHints))}` : ua
  const hit = cache.get(cacheKey)
  if (hit) {
    return hit
  }

  const parsedHints = withHints ? hintsParser.parse(toRawHints(withHints), {}) : {}
  const result = detector.detect(ua, parsedHints)
  // Bot classification lives in a separate parser (`detect()` never merges
  // it); its category maps onto the historical crawler/fetcher vocabulary.
  const bot = detector.parseBot(ua, {}) as { name?: string; category?: string }

  const osName = result.os?.name || null
  const clientName = result.client?.name || null
  const rawDeviceType = result.device?.type || null
  const brand = result.device?.brand || ''
  const model = result.device?.model || ''

  const fields: ParsedUaFields = {
    os: osName ? (OS_NAME_MAP[osName] ?? osName) : null,
    browser: bot.name ?? (clientName ? (BROWSER_NAME_MAP[clientName] ?? clientName) : null),
    browserType: bot.name
      ? bot.category === 'Feed Fetcher'
        ? 'fetcher'
        : 'crawler'
      : browserTypeOf(result.client?.type ?? null),
    device: model ? deviceLabel(brand, model) : null,
    deviceType: rawDeviceType ? (DEVICE_TYPE_MAP[rawDeviceType] ?? null) : null,
  }

  if (cache.size >= CACHE_CAP) {
    // Map iterates in insertion order — the first key is the oldest.
    const oldest = cache.keys().next().value
    if (oldest !== undefined) {
      cache.delete(oldest)
    }
  }
  cache.set(cacheKey, fields)
  return fields
}
