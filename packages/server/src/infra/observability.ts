import { isPrivateIp } from '@kobato/base/auth/network'

export const OBSERVABILITY_ORGANIZATION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

export function isObservabilityLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host === '[::1]' || host === '::1') {
    return true
  }
  return /^127(?:\.\d{1,3}){3}$/.test(host)
}

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

export function isSecureObservabilityOrigin(raw: string): boolean {
  const origin = normalizeObservabilityOrigin(raw)
  if (origin === null) {
    return false
  }
  const url = new URL(origin)
  return url.protocol === 'https:' || isObservabilityLoopbackHost(url.hostname) || isPrivateIp(url.hostname)
}
