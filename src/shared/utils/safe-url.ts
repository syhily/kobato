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

function isHttpUrl(value: string): boolean {
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
