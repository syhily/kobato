// Trusted-proxy matching behind `security.trustedProxies`: exact IPs (v4/v6)
// and IPv4 CIDR ranges (e.g. a Docker/Traefik overlay subnet). Shared by the
// config schema (entry validation) and the client-address extractor (peer
// matching) so the accepted grammar can never drift between the two.

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|1?\d{1,2})$/

const IPV6_RE =
  /^(?:(?:[\da-fA-F]{1,4}:){7}[\da-fA-F]{1,4}|(?:[\da-fA-F]{1,4}:){1,7}:|(?:[\da-fA-F]{1,4}:){1,6}:[\da-fA-F]{1,4}|(?:[\da-fA-F]{1,4}:){1,5}(?::[\da-fA-F]{1,4}){1,2}|(?:[\da-fA-F]{1,4}:){1,4}(?::[\da-fA-F]{1,4}){1,3}|(?:[\da-fA-F]{1,4}:){1,3}(?::[\da-fA-F]{1,4}){1,4}|(?:[\da-fA-F]{1,4}:){1,2}(?::[\da-fA-F]{1,4}){1,5}|[\da-fA-F]{1,4}:(?::[\da-fA-F]{1,4}){1,6}|:(?:(?::[\da-fA-F]{1,4}){1,7}|:)|fe80:(?::[\da-fA-F]{0,4}){0,4}%[\da-zA-Z]{1,}|::(?:ffff(?::0{1,4}){0,1}:){0,1}(?:(?:25[0-5]|2[0-4]\d|1?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|1?\d{1,2})|[\da-fA-F]{1,4}:(?::[\da-fA-F]{1,4}){1,4})$/

export function isValidIp(ip: string): boolean {
  return IPV4_RE.test(ip) || IPV6_RE.test(ip)
}

/** Dotted-quad → uint32; null for anything that is not a valid IPv4 literal. */
function parseIpv4(ip: string): number | null {
  if (!IPV4_RE.test(ip)) {
    return null
  }
  const [a, b, c, d] = ip.split('.').map(Number)
  return ((a! << 24) | (b! << 16) | (c! << 8) | d!) >>> 0
}

/**
 * A trusted-proxy entry is an exact IP (v4 or v6) or an IPv4 CIDR
 * (`a.b.c.d/0-32`). IPv6 CIDRs are deliberately rejected — v6 proxies match
 * exactly, so a misleading `/64` can never widen the trust domain.
 */
export function isValidTrustedProxyEntry(entry: string): boolean {
  const slash = entry.indexOf('/')
  if (slash === -1) {
    return isValidIp(entry)
  }
  const prefixRaw = entry.slice(slash + 1)
  if (!/^\d{1,2}$/.test(prefixRaw) || Number(prefixRaw) > 32) {
    return false
  }
  return parseIpv4(entry.slice(0, slash)) !== null
}

/** Whether the direct peer may vouch for proxy headers under the configured entries. */
export function matchesTrustedProxy(peer: string, entries: readonly string[]): boolean {
  for (const entry of entries) {
    const slash = entry.indexOf('/')
    if (slash === -1) {
      if (peer === entry) {
        return true
      }
      continue
    }
    const baseInt = parseIpv4(entry.slice(0, slash))
    const peerInt = parseIpv4(peer)
    if (baseInt === null || peerInt === null) {
      continue
    }
    const prefix = Number(entry.slice(slash + 1))
    // JS shifts are mod-32 — a /0 mask must be special-cased or it becomes /32.
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
    if ((peerInt & mask) === (baseInt & mask)) {
      return true
    }
  }
  return false
}
