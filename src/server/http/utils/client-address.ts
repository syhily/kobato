/**
 * Proxy-aware client IP extraction: proxy headers are trusted ONLY from a
 * loopback direct peer, else the direct IP verbatim; no direct IP → 'unknown'
 * (non-loopback, so proxy headers stay untrusted).
 */

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

export function getClientAddress(request: Request, directIp?: string): string {
  // Unknown direct peer must NOT become loopback — that would trust spoofed proxy headers (P0-5).
  if (directIp === undefined) {
    return 'unknown'
  }
  const base = directIp

  // Only a localhost direct peer may vouch for proxy headers — any remote client can forge them.
  if (!isLoopback(base)) {
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
