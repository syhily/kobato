import { UAParser } from 'ua-parser-js'

const MAX_RAW = 80

/**
 * Short label for a list cell via `ua-parser-js`; falls back to the
 * truncated raw UA. `platformHint` (`Sec-CH-UA-Platform`) is preferred
 * over the parsed OS because desktop-mode iOS sends a macOS-like UA.
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
