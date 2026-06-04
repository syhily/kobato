/**
 * Extract the client IP address from a Request, with proxy-aware parsing.
 *
 * Trust model:
 *   - `TRUSTED_PROXY_COUNT` env var controls how many proxy hops are trusted.
 *   - When 0 (default), no forwarding headers are trusted; the direct
 *     connection IP is used.
 *   - When N > 0, the rightmost N entries of `X-Forwarded-For` are trusted.
 *   - `CF-Connecting-IP` and `X-Real-IP` are only trusted when at least one
 *     proxy hop is configured.
 *
 * Falls back to `127.0.0.1` when no proxy headers are present and no
 * direct IP is provided.
 */

import { TRUSTED_PROXY_COUNT } from '@/server/infra/env'

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|1?\d{1,2})$/

const IPV6_RE =
  /^(?:(?:[\da-fA-F]{1,4}:){7}[\da-fA-F]{1,4}|(?:[\da-fA-F]{1,4}:){1,7}:|(?:[\da-fA-F]{1,4}:){1,6}:[\da-fA-F]{1,4}|(?:[\da-fA-F]{1,4}:){1,5}(?::[\da-fA-F]{1,4}){1,2}|(?:[\da-fA-F]{1,4}:){1,4}(?::[\da-fA-F]{1,4}){1,3}|(?:[\da-fA-F]{1,4}:){1,3}(?::[\da-fA-F]{1,4}){1,4}|(?:[\da-fA-F]{1,4}:){1,2}(?::[\da-fA-F]{1,4}){1,5}|[\da-fA-F]{1,4}:(?::[\da-fA-F]{1,4}){1,6}|:(?:(?::[\da-fA-F]{1,4}){1,7}|:)|fe80:(?::[\da-fA-F]{0,4}){0,4}%[\da-zA-Z]{1,}|::(?:ffff(?::0{1,4}){0,1}:){0,1}(?:(?:25[0-5]|2[0-4]\d|1?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|1?\d{1,2})|[\da-fA-F]{1,4}:(?::[\da-fA-F]{1,4}){1,4})$/

function isValidIp(ip: string): boolean {
  return IPV4_RE.test(ip) || IPV6_RE.test(ip)
}

function sanitizeIp(raw: string): string | null {
  const trimmed = raw.trim()
  return isValidIp(trimmed) ? trimmed : null
}

export function getClientAddress(request: Request, directIp?: string): string {
  if (TRUSTED_PROXY_COUNT === 0) {
    return directIp ?? '127.0.0.1'
  }

  // 1. Cloudflare-specific header — trusted only when behind proxies.
  const cfIp = request.headers.get('cf-connecting-ip')
  if (cfIp) {
    const sanitized = sanitizeIp(cfIp)
    if (sanitized) {
      return sanitized
    }
  }

  // 2. Single-hop proxy header — trusted only when behind proxies.
  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    const sanitized = sanitizeIp(realIp)
    if (sanitized) {
      return sanitized
    }
  }

  // 3. Multi-hop proxy chain — trust the rightmost TRUSTED_PROXY_COUNT entries.
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const hops = forwarded.split(',').map((h) => h.trim())
    const start = Math.max(0, hops.length - TRUSTED_PROXY_COUNT)
    for (let i = start; i < hops.length; i++) {
      const sanitized = sanitizeIp(hops[i]!)
      if (sanitized) {
        return sanitized
      }
    }
  }

  return directIp ?? '127.0.0.1'
}
