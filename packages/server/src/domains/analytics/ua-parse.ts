import DeviceDetector from 'node-device-detector'
import ClientHints from 'node-device-detector/client-hints'

export interface UaClientHints {
  model?: string | null
  platform?: string | null
  platformVersion?: string | null
  mobile?: string | null
  brands?: string | null
  fullVersion?: string | null
  arch?: string | null
  bitness?: string | null
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

function deviceLabel(brand: string, model: string): string {
  if (!brand || brand === 'Apple' || model.startsWith(brand)) {
    return model
  }
  return `${brand} ${model}`
}

const detector = new DeviceDetector({ skipBotDetection: false, osVersionTruncate: null, clientVersionTruncate: null })
const hintsParser = new ClientHints()

const MAX_RAW_LABEL = 80

function normalizePlatformHint(hint: string | null | undefined): string | null {
  const unquoted = hint?.replace(/^"|"$/g, '') ?? ''
  return unquoted === '' ? null : unquoted
}

export const UNKNOWN_UA_LABEL = 'Unknown device'

export function formatUaLabel(
  ua: string | null | undefined,
  platformHint?: string | null,
  unknownLabel: string = UNKNOWN_UA_LABEL,
): string {
  const platform = normalizePlatformHint(platformHint)
  if (!ua) {
    return platform ?? unknownLabel
  }

  const result = detector.detect(ua, {})
  const clientName = result.client?.name || null
  const browserName = clientName ? (BROWSER_NAME_MAP[clientName] ?? clientName) : null
  const majorVersion = result.client?.version ? result.client.version.split('.')[0] : ''
  const browser = browserName ? (majorVersion ? `${browserName} ${majorVersion}` : browserName) : null

  const osName = result.os?.name || null
  const os = platform ?? (osName ? (OS_NAME_MAP[osName] ?? osName) : null)

  if (browser && os) {
    return `${browser} · ${os}`
  }
  if (browser) {
    return browser
  }
  if (os) {
    return os
  }

  return ua.length > MAX_RAW_LABEL ? `${ua.slice(0, MAX_RAW_LABEL - 1)}…` : ua
}

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
    const oldest = cache.keys().next().value
    if (oldest !== undefined) {
      cache.delete(oldest)
    }
  }
  cache.set(cacheKey, fields)
  return fields
}
