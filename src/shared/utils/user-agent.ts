import { UAParser } from 'ua-parser-js'

const MAX_RAW = 80

/**
 * Build a short label suitable for a list cell. Uses `ua-parser-js`
 * for structured browser / OS / device extraction. Falls back to the
 * raw UA (truncated) when parsing fails so the operator can still
 * tell two devices apart by manual inspection.
 *
 * `platformHint` is the value of the `Sec-CH-UA-Platform` client hint.
 * It is preferred over the OS parsed from the UA because iOS/iPadOS
 * devices in "desktop mode" send a macOS-like User-Agent string.
 */
export function formatUserAgentLabel(ua: string | null | undefined, platformHint?: string | null): string {
  if (!ua) {
    return platformHint ?? '未知设备'
  }

  const result = new UAParser(ua).getResult()
  const browser = result.browser.name
    ? `${result.browser.name}${result.browser.version ? ` ${result.browser.version.split('.')[0]}` : ''}`
    : null
  const os = platformHint ?? result.os.name ?? null

  if (browser && os) {
    return `${browser} · ${os}`
  }
  if (browser) {
    return browser
  }
  if (os) {
    return os
  }

  return ua.length > MAX_RAW ? `${ua.slice(0, MAX_RAW - 1)}…` : ua
}
