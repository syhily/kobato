/**
 * Extract the client IP address from a Request, with proxy-aware parsing.
 *
 * Trust model:
 *   - Proxy headers (X-Forwarded-For, X-Real-IP, CF-Connecting-IP) are
 *     ONLY trusted when the direct TCP connection comes from localhost
 *     (127.0.0.1/8 or ::1). This prevents remote clients from spoofing
 *     their IP without requiring any env configuration.
 *   - When the direct connection is remote, the direct IP is returned
 *     verbatim and all forwarding headers are ignored.
 *
 * Falls back to `'unknown'` when no direct IP is provided (e.g. behind a
 * Unix-socket reverse proxy). The placeholder is deliberately NOT a
 * loopback address, so proxy headers stay untrusted in that case.
 *
 * Deployment constraint: under a Unix-socket reverse proxy every request
 * shares the single `'unknown'` bucket, so IP-keyed rate limiting degrades
 * to one global per-instance bucket — the fronting proxy should rate-limit
 * at the edge. Where the socket still reports a remote port, the caller
 * keys on `port:<n>` instead (per-connection buckets); a non-IP direct
 * peer like that passes through verbatim below since it is never loopback.
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
  // Security: the loopback check below is the ONLY gate on trusting proxy
  // headers. When the direct peer is unknown — e.g. behind a Unix-socket
  // reverse proxy where `socket.remoteAddress` is undefined — we must NOT
  // substitute '127.0.0.1' here: that would pass the loopback check and
  // let any remote client spoof X-Forwarded-For / CF-Connecting-IP,
  // bypassing every IP-keyed rate limit and forging audit IPs (P0-5).
  // Return a non-IP placeholder instead; proxy headers stay untrusted.
  if (directIp === undefined) {
    return 'unknown'
  }
  const base = directIp

  // Only trust proxy headers when the direct TCP connection is from
  // localhost. Any remote client can forge X-Forwarded-For; we ignore
  // it entirely unless a local reverse proxy (nginx, caddy, etc.) is
  // sitting in front of the application.
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

  // 3. Multi-hop proxy chain — the rightmost entry was added by our
  //    trusted localhost proxy, so it's the most reliable one.
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
