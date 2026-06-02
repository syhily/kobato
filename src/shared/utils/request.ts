/**
 * Extract the client IP address from a Request, with proxy-aware parsing.
 *
 * Trust model:
 *   1. `CF-Connecting-IP` — set by Cloudflare, trusted implicitly.
 *   2. `X-Real-IP` — set by the immediate reverse proxy, trusted implicitly.
 *   3. `X-Forwarded-For` — may contain multiple hops; we take the
 *      rightmost entry (the one added by the proxy closest to the app).
 *      If the app sits behind N proxies, the rightmost is the most
 *      reliable.  We also validate the result looks like an IP.
 *
 * Falls back to `127.0.0.1` when no proxy headers are present.
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

export function getClientAddress(request: Request): string {
  // 1. Cloudflare-specific header — trusted because it's set by the edge.
  const cfIp = request.headers.get('cf-connecting-ip')
  if (cfIp) {
    const sanitized = sanitizeIp(cfIp)
    if (sanitized) {
      return sanitized
    }
  }

  // 2. Single-hop proxy header — trusted because only the immediate proxy
  //    can set it without being overwritten by downstream hops.
  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    const sanitized = sanitizeIp(realIp)
    if (sanitized) {
      return sanitized
    }
  }

  // 3. Multi-hop proxy chain — use the RIGHTMOST entry, which was added
  //    by the proxy closest to the application (the most trustworthy).
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const hops = forwarded.split(',').map((h) => h.trim())
    // Walk right-to-left to find the first valid IP.
    for (let i = hops.length - 1; i >= 0; i--) {
      const sanitized = sanitizeIp(hops[i]!)
      if (sanitized) {
        return sanitized
      }
    }
  }

  return '127.0.0.1'
}
