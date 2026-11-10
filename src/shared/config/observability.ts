// OpenObserve observability grammar shared by the settings write schema (early,
// actionable feedback) and the server runtime resolver (the authority). Both must
// agree: the settings layer must never persist a value the runtime would reject.

import { isPrivateIp } from '@/shared/utils/safe-url'

/** An OpenObserve organization is one path segment: no separators, no dots. */
export const OBSERVABILITY_ORGANIZATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

export function isObservabilityLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host === '[::1]' || host === '::1') {
    return true
  }
  return /^127(?:\.\d{1,3}){3}$/.test(host)
}

/**
 * Parse the configured OpenObserve origin. Rejects credentials, query strings,
 * fragments, non-root paths, non-http(s) schemes, and surrounding whitespace.
 * Returns the normalized origin, or `null` when the value is not an origin.
 */
export function normalizeObservabilityOrigin(raw: string): string | null {
  if (raw.length === 0 || raw !== raw.trim()) {
    return null
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null
  }
  if (url.username !== '' || url.password !== '') {
    return null
  }
  if (url.search !== '' || url.hash !== '') {
    return null
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    return null
  }
  return url.origin
}

/**
 * Write-path gate for a NON-EMPTY origin: it must be an origin, and plain HTTP is
 * only allowed for loopback or a private/reserved IP literal. Every signal —
 * server OTLP and the relayed browser RUM batches alike — leaves through the
 * server with the ingestion credential attached, so a public plaintext hop stays
 * rejected while an internal OpenObserve (`http://192.168.x.x:5080`) is a
 * legitimate deployment. A hostname (even one that resolves privately) still
 * requires HTTPS: the grammar cannot classify it without a DNS answer.
 */
export function isSecureObservabilityOrigin(raw: string): boolean {
  const origin = normalizeObservabilityOrigin(raw)
  if (origin === null) {
    return false
  }
  const url = new URL(origin)
  return url.protocol === 'https:' || isObservabilityLoopbackHost(url.hostname) || isPrivateIp(url.hostname)
}
