/**
 * Proxy-address trust model — the SINGLE implementation shared by the
 * core server (`packages/server/src/http/utils/client-address.ts`) and the
 * official frontend's write proxy (`apps/public/src/lib/http/rpc-proxy.ts`).
 *
 * Both processes answer the same question — "which header, if any, is an
 * honest statement of the visitor's address?" — and both MUST answer it
 * identically: core decides what to trust on the receiving side, the
 * frontend decides what to forward on the sending side. A drift between
 * the two would let one side honour a header the other side would not
 * (or vice versa), so the model lives here, imported by both.
 *
 * Trust rules (shared by both callers):
 *   - Forwarding headers (`CF-Connecting-IP`, `X-Real-IP`,
 *     `X-Forwarded-For`) are ONLY trusted when the direct TCP peer is
 *     loopback (127.0.0.1/8, ::1, or the IPv4-mapped forms) — the
 *     operator's reverse proxy on the same host. A remote peer's headers
 *     are freely forgeable and are ignored entirely.
 *   - Precedence: `CF-Connecting-IP` → `X-Real-IP` → rightmost VALID
 *     entry of `X-Forwarded-For` (the nearest trusted proxy appends last).
 *   - Invalid values (not a syntactically valid IP) are skipped — a
 *     garbage header must never become the visitor address.
 *   - No honest address derivable → `null` (the caller decides the
 *     fallback: core keys on `'unknown'` for rate-limit buckets, the
 *     frontend omits the forwarding header so core sees the transport).
 */

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|1?\d{1,2})$/

const IPV6_RE =
  /^(?:(?:[\da-fA-F]{1,4}:){7}[\da-fA-F]{1,4}|(?:[\da-fA-F]{1,4}:){1,7}:|(?:[\da-fA-F]{1,4}:){1,6}:[\da-fA-F]{1,4}|(?:[\da-fA-F]{1,4}:){1,5}(?::[\da-fA-F]{1,4}){1,2}|(?:[\da-fA-F]{1,4}:){1,4}(?::[\da-fA-F]{1,4}){1,3}|(?:[\da-fA-F]{1,4}:){1,3}(?::[\da-fA-F]{1,4}){1,4}|(?:[\da-fA-F]{1,4}:){1,2}(?::[\da-fA-F]{1,4}){1,5}|[\da-fA-F]{1,4}:(?::[\da-fA-F]{1,4}){1,6}|:(?:(?::[\da-fA-F]{1,4}){1,7}|:)|fe80:(?::[\da-fA-F]{0,4}){0,4}%[\da-zA-Z]{1,}|::(?:ffff(?::0{1,4}){0,1}:){0,1}(?:(?:25[0-5]|2[0-4]\d|1?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|1?\d{1,2})|[\da-fA-F]{1,4}:(?::[\da-fA-F]{1,4}){1,4})$/

function isValidIp(ip: string): boolean {
  return IPV4_RE.test(ip) || IPV6_RE.test(ip)
}

/** The loopback gate — the ONLY precondition for trusting forwarding headers. */
export function isLoopbackIp(ip: string): boolean {
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

export interface ProxyAddressHeaders {
  /** `CF-Connecting-IP` — most reliable when behind Cloudflare. */
  cfConnectingIp: string | null
  /** `X-Real-IP` — typically set by nginx/caddy on localhost. */
  realIp: string | null
  /** `X-Forwarded-For` — multi-hop chain, rightmost entry wins. */
  forwardedFor: string | null
}

/**
 * Resolve the visitor address from the direct peer + forwarding headers.
 * Returns `null` when no honest address is derivable (unknown direct
 * peer, or loopback peer without any valid forwarding header).
 */
export function resolveProxyAddress(direct: string | null, headers: ProxyAddressHeaders): string | null {
  // Security: the loopback check is the ONLY gate on trusting proxy
  // headers. An unknown direct peer must NOT fall back to a loopback
  // placeholder — that would pass the check and let any remote client
  // forge the forwarding headers (P0-5 in the server package's history).
  if (direct === null || !isLoopbackIp(direct)) {
    return direct
  }

  const cf = headers.cfConnectingIp?.trim() ?? null
  if (cf !== null && isValidIp(cf)) {
    return cf
  }

  const real = headers.realIp?.trim() ?? null
  if (real !== null && isValidIp(real)) {
    return real
  }

  const forwarded = headers.forwardedFor?.trim() ?? null
  if (forwarded !== null) {
    const hops = forwarded.split(',').map((hop) => hop.trim())
    for (let i = hops.length - 1; i >= 0; i--) {
      const hop = hops[i]
      if (hop !== undefined && hop !== '' && isValidIp(hop)) {
        return hop
      }
    }
  }

  return direct
}
