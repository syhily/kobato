// Pure URL formatting and navigation helpers. Security policy (SSRF/private
// hosts, passkey RP rules) lives in `@kobato/auth/network`; Zod URL contracts
// live in `@kobato/utils/url-schema`. Keep this module dependency-free.

// Control characters in a redirect target are never legitimate: the URL
// parser silently strips some (tab/newline) and percent-encodes others, so
// reject the raw value before either can reshape the path.
function hasControlChar(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0)
    if (code !== undefined && (code <= 0x1f || code === 0x7f)) {
      return true
    }
  }
  return false
}

export function safeHref(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed === '') {
    return undefined
  }
  return isHttpUrl(trimmed) ? trimmed : undefined
}

export function safeRedirectPath(value: string | null | undefined, fallback: string, origin: string): string {
  if (value === null || value === undefined) {
    return fallback
  }
  const trimmed = value.trim()
  if (trimmed === '' || hasControlChar(trimmed)) {
    return fallback
  }

  try {
    const base = new URL(origin)
    const url = new URL(trimmed, base)
    if (url.origin !== base.origin) {
      return fallback
    }
    // Dot-segment normalization can rewrite a single-slash input into a
    // network-path reference (`/..//evil.com` → `//evil.com`), which the
    // browser resolves as a cross-origin URL. Only a single-slash path is
    // same-origin.
    if (!url.pathname.startsWith('/') || url.pathname.startsWith('//')) {
      return fallback
    }
    const path = `${url.pathname}${url.search}${url.hash}`
    return hasControlChar(path) ? fallback : path
  } catch {
    return fallback
  }
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function tryParseUrl(raw: string): URL | null {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

/** URL shape safe for logs: origin + pathname only. Userinfo, query, and
 *  fragment are dropped — signed CDN URLs carry credentials in the query
 *  string that must never reach a log line. */
export function redactUrlForLog(raw: string): string {
  const parsed = tryParseUrl(raw)
  if (parsed === null) {
    return '<unparsable>'
  }
  return `${parsed.origin}${parsed.pathname}`
}
