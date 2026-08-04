/**
 * Extract the client IP address from a Request, with proxy-aware parsing.
 *
 * The trust model lives in `@kobato/shared/http/proxy-address` — the
 * single implementation shared with the official frontend's write proxy
 * (both sides must agree on what to trust/forward). Rules:
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

import { resolveProxyAddress } from '@kobato/shared/http/proxy-address'

export function getClientAddress(request: Request, directIp?: string): string {
  // Security: the loopback check in `resolveProxyAddress` is the ONLY gate
  // on trusting proxy headers. When the direct peer is unknown — e.g.
  // behind a Unix-socket reverse proxy where `socket.remoteAddress` is
  // undefined — we must NOT substitute '127.0.0.1' here: that would pass
  // the loopback check and let any remote client spoof X-Forwarded-For /
  // CF-Connecting-IP, bypassing every IP-keyed rate limit and forging
  // audit IPs (P0-5). Return a non-IP placeholder instead; proxy headers
  // stay untrusted.
  if (directIp === undefined) {
    return 'unknown'
  }
  const resolved = resolveProxyAddress(directIp, {
    cfConnectingIp: request.headers.get('cf-connecting-ip'),
    realIp: request.headers.get('x-real-ip'),
    forwardedFor: request.headers.get('x-forwarded-for'),
  })
  // `resolveProxyAddress` only returns `null` for a `null` direct peer,
  // which cannot happen here — the non-null fallback keeps the type total.
  return resolved ?? directIp
}
