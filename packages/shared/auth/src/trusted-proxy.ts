const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|1?\d{1,2})$/

const IPV6_RE =
  /^(?:(?:[\da-fA-F]{1,4}:){7}[\da-fA-F]{1,4}|(?:[\da-fA-F]{1,4}:){1,7}:|(?:[\da-fA-F]{1,4}:){1,6}:[\da-fA-F]{1,4}|(?:[\da-fA-F]{1,4}:){1,5}(?::[\da-fA-F]{1,4}){1,2}|(?:[\da-fA-F]{1,4}:){1,4}(?::[\da-fA-F]{1,4}){1,3}|(?:[\da-fA-F]{1,4}:){1,3}(?::[\da-fA-F]{1,4}){1,4}|(?:[\da-fA-F]{1,4}:){1,2}(?::[\da-fA-F]{1,4}){1,5}|[\da-fA-F]{1,4}:(?::[\da-fA-F]{1,4}){1,6}|:(?:(?::[\da-fA-F]{1,4}){1,7}|:)|fe80:(?::[\da-fA-F]{0,4}){0,4}%[\da-zA-Z]{1,}|::(?:ffff(?::0{1,4}){0,1}:){0,1}(?:(?:25[0-5]|2[0-4]\d|1?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|1?\d{1,2})|[\da-fA-F]{1,4}:(?::[\da-fA-F]{1,4}){1,4})$/

export function isValidIp(ip: string): boolean {
  return IPV4_RE.test(ip) || IPV6_RE.test(ip)
}

function parseIpv4(ip: string): number | null {
  if (!IPV4_RE.test(ip)) {
    return null
  }
  const [a, b, c, d] = ip.split('.').map(Number)
  return ((a! << 24) | (b! << 16) | (c! << 8) | d!) >>> 0
}

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
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
    if ((peerInt & mask) === (baseInt & mask)) {
      return true
    }
  }
  return false
}
