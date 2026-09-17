/**
 * Proxy-aware client IP extraction: proxy headers are trusted ONLY from a
 * loopback direct peer or a configured trusted proxy
 * (`security.trustedProxies`), else the direct IP verbatim; no direct IP →
 * 'unknown' (non-loopback, so proxy headers stay untrusted).
 */

import { isValidIp, matchesTrustedProxy } from '@/server/infra/ip-match'

function sanitizeIp(raw: string): string | null {
  const trimmed = raw.trim()
  return isValidIp(trimmed) ? trimmed : null
}

function isLoopback(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1') {
    return true
  }
  if (ip.startsWith('127.') && ip.split('.').length === 4) {
    return true
  }
  if (ip.startsWith('::ffff:127.')) {
    return true
  }
  return false
}

export function getClientAddress(request: Request, directIp?: string, trustedProxies: readonly string[] = []): string {
  // Unknown direct peer must NOT become loopback — that would trust spoofed proxy headers (P0-5).
  if (directIp === undefined) {
    return 'unknown'
  }
  const base = directIp

  // Only a localhost or configured trusted-proxy peer may vouch for proxy
  // headers — any other remote client can forge them.
  if (!isLoopback(base) && !matchesTrustedProxy(base, trustedProxies)) {
    return base
  }

  // 1. Cloudflare-specific header — most reliable when behind Cloudflare.
  const cfIp = request.headers.get('cf-connecting-ip')
  if (cfIp) {
    const sanitized = sanitizeIp(cfIp)
    if (sanitized) {
      return sanitized
    }
  }

  // 2. Single-hop proxy header — typically set by nginx/caddy on localhost.
  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    const sanitized = sanitizeIp(realIp)
    if (sanitized) {
      return sanitized
    }
  }

  // 3. X-Forwarded-For chain — rightmost hop came from the trusted localhost proxy.
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const hops = forwarded.split(',').map((h) => h.trim())
    for (let i = hops.length - 1; i >= 0; i--) {
      const sanitized = sanitizeIp(hops[i]!)
      if (sanitized) {
        return sanitized
      }
    }
  }

  return base
}
