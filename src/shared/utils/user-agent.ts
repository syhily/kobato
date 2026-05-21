// Minimal User-Agent label extractor. The session-management views show
// one short human-readable string per device, so we trade comprehensive
// parsing (and a 30KB ua-parser-js dependency) for a 20-line regex pass
// that lands on "Chrome 120 / macOS"-style summaries for the browsers
// we actually see in the wild.
//
// The function is intentionally isomorphic so the public `/my/sessions`
// view and the admin `/admin/security/sessions` view share the exact same
// label. Unknown strings fall back to a truncated copy of the raw UA so
// the operator never sees an empty cell.

const MAX_RAW = 80

interface ParsedUa {
  browser: string | null
  os: string | null
}

function detectBrowser(ua: string): { name: string; version: string } | null {
  // Order matters: Edg/OPR/Brave all also report "Chrome" in their UA,
  // so the more specific tokens come first.
  const tests: Array<[RegExp, string]> = [
    [/Edg\/([\d.]+)/, 'Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/Chrome\/([\d.]+)/, 'Chrome'],
    [/Version\/([\d.]+).*Safari\//, 'Safari'],
  ]
  for (const [re, name] of tests) {
    const match = ua.match(re)
    if (match) {
      // Keep major version only — minor / build digits clutter the label.
      const version = (match[1] ?? '').split('.')[0] ?? ''
      return { name, version }
    }
  }
  return null
}

function detectOs(ua: string): string | null {
  if (ua.includes('Windows NT 10')) {
    return 'Windows'
  }
  if (ua.includes('Windows')) {
    return 'Windows'
  }
  if (/iPhone|iPad|iPod/.test(ua)) {
    return 'iOS'
  }
  if (ua.includes('Android')) {
    return 'Android'
  }
  if (/Mac OS X|Macintosh/.test(ua)) {
    return 'macOS'
  }
  if (ua.includes('Linux')) {
    return 'Linux'
  }
  return null
}

export function parseUserAgent(ua: string | null | undefined): ParsedUa {
  if (!ua) {
    return { browser: null, os: null }
  }
  const browser = detectBrowser(ua)
  const os = detectOs(ua)
  return {
    browser: browser ? `${browser.name}${browser.version ? ` ${browser.version}` : ''}` : null,
    os,
  }
}

/**
 * Build a short label suitable for a list cell. Falls back to the raw UA
 * (truncated) when parsing fails so the operator can still tell two
 * devices apart by manual inspection.
 */
export function formatUserAgentLabel(ua: string | null | undefined): string {
  if (!ua) {
    return '未知设备'
  }
  const parsed = parseUserAgent(ua)
  if (parsed.browser && parsed.os) {
    return `${parsed.browser} · ${parsed.os}`
  }
  if (parsed.browser) {
    return parsed.browser
  }
  if (parsed.os) {
    return parsed.os
  }
  return ua.length > MAX_RAW ? `${ua.slice(0, MAX_RAW - 1)}…` : ua
}
