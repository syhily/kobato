import { z } from 'zod'

const HTTP_URL_MESSAGE = '请输入 http(s) URL'

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
  if (trimmed === '') {
    return fallback
  }

  try {
    const base = new URL(origin)
    const url = new URL(trimmed, base)
    if (url.origin !== base.origin) {
      return fallback
    }
    return `${url.pathname}${url.search}${url.hash}`
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

const httpUrlSchema = z.url().refine(isHttpUrl, { message: HTTP_URL_MESSAGE })

export const optionalHttpUrlSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}, httpUrlSchema.optional())

/** Try to parse a string as a URL. Returns null on failure. */
export function tryParseUrl(raw: string): URL | null {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

const IPV4_PRIVATE = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|169\.254\.|0\.|22[4-9]\.|2[3-5][0-9]\.)/

/** Hostnames that must never be the target of an admin-influenced server-side
 *  outbound fetch (SSRF guard). Combines the IP-literal check in `isPrivateIp`
 *  with the loopback/`0.0.0.0`/`*.localhost` *names* that `isPrivateIp` does not
 *  cover. Pass `URL.hostname` (already lowercased by `URL`, but we lowercase
 *  defensively). */
export function isBlockedFetchHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host === '[::1]' || host.endsWith('.localhost')) {
    return true
  }
  return isPrivateIp(host)
}

/** Check whether a hostname is a private/reserved IP address. Only applies to
 *  actual IP addresses — domain names like `fcbarcelona.com` are NOT flagged.
 *  Handles bracketed IPv6 format from URL.hostname (e.g. `[fc00::1]`). */
export function isPrivateIp(hostname: string): boolean {
  // Strip brackets from IPv6 URL hostnames: [fc00::1] → fc00::1
  const h = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
  // IPv4 private ranges (RFC 1918) + loopback + link-local + multicast
  if (IPV4_PRIVATE.test(h)) {
    return true
  }
  // IPv6 ULA / link-local — only when hostname looks like an actual IPv6 address
  if (h.includes(':') && /^(fc|fd|fe80)/i.test(h)) {
    return true
  }
  return false
}

export const httpUrlOrEmptyStringSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) {
      return ''
    }
    if (typeof value !== 'string') {
      return value
    }
    const trimmed = value.trim()
    return trimmed === '' ? '' : trimmed
  },
  z.union([z.literal(''), httpUrlSchema]),
)

/** Validates that a website URL meets Passkey RP requirements:
 *  HTTPS protocol, public hostname (no localhost / private IP / IPv6 ULA).
 */
export function isValidPasskeyDomain(website: string): boolean {
  try {
    const url = new URL(website)
    if (url.protocol !== 'https:') {
      return false
    }
    const hostname = url.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') {
      return false
    }
    return !isPrivateIp(hostname)
  } catch {
    return false
  }
}

// Known Gravatar-compatible mirror hosts. The avatar mirror URL is
// admin-configurable and fetched by the public `/images/avatar/:filename.png`
// endpoint, so an admin (or compromised admin cookie) could otherwise point
// it at a cloud metadata endpoint or any internal address and let visitors
// trigger the fetch — an SSRF primitive.
const ALLOWED_GRAVATAR_HOSTS = new Set([
  'gravatar.com',
  'www.gravatar.com',
  'cn.gravatar.com',
  'en.gravatar.com',
  'secure.gravatar.com',
  'i.gravatar.com',
  // Public Gravatar-compatible mirrors commonly used in China / by the
  // community. Keep this list explicit; do not open it to arbitrary hosts.
  'cdn.v2ex.com',
  'sdn.geekzu.org',
  'gravatar.loli.net',
  'cravatar.cn',
  'seccdn.libravatar.org',
  'weavatar.com',
  'gravatar.webp.se',
])

/** Return `true` only when `rawUrl` is an HTTPS URL on a known Gravatar
 *  mirror host that is NOT a loopback / private / link-local address.
 *  Defence in depth: the allowlist already excludes unknown hosts, but we
 *  also scan for private IP ranges so a future DNS rebinding of an allowed
 *  hostname to an internal IP cannot slip through. */
export function isAllowedMirrorUrl(rawUrl: string): boolean {
  const parsed = tryParseUrl(rawUrl)
  if (parsed === null) {
    return false
  }
  if (parsed.protocol !== 'https:') {
    return false
  }
  const host = parsed.hostname.toLowerCase()
  if (!ALLOWED_GRAVATAR_HOSTS.has(host)) {
    return false
  }
  return !isPrivateIp(host)
}
