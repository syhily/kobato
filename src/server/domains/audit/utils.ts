// ---------------------------------------------------------------------------
// Audit Log display helpers — IP / UA masking
// ---------------------------------------------------------------------------

/**
 * Mask an IPv4 or IPv6 address for display.
 *
 * IPv4: 192.168.1.42  → 192.168.x.x
 * IPv6: 2001:db8::1   → 2001:db8:x:x (first 2 groups kept)
 */
export function maskIp(ip: string | null | undefined): string {
  if (!ip) {
    return ''
  }

  // IPv4-mapped IPv6: ::ffff:192.168.1.1
  const mappedMatch = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (mappedMatch) {
    const v4 = mappedMatch[1]
    const parts = v4.split('.')
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.x.x`
    }
    return v4
  }

  // IPv4
  if (ip.includes('.')) {
    const parts = ip.split('.')
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.x.x`
    }
    return ip
  }

  // IPv6
  if (ip.includes(':')) {
    const parts = ip.split(':').filter((p) => p.length > 0)
    if (parts.length >= 3) {
      return `${parts[0]}:${parts[1]}:${parts[2]}:x:x`
    }
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}:x:x`
    }
    return ip
  }

  return ip
}

/**
 * Simplify a User-Agent string for display by keeping only the browser
 * family and OS family (when parsable). Falls back to truncation for
 * unrecognised strings.
 */
export function maskUserAgent(ua: string | null | undefined): string {
  if (!ua) {
    return ''
  }

  // Try to extract browser name + OS name using common UA patterns.
  const browserMatch = ua.match(/(Chrome|Firefox|Safari|Edge|Opera|Brave)\/[^\s]+/i)
  const osMatch = ua.match(/\(([^)]+)\)/)

  if (browserMatch && osMatch) {
    const browser = browserMatch[1]
    const osRaw = osMatch[1]
    // osRaw often looks like "Windows NT 10.0; Win64; x64" or "Macintosh; Intel Mac OS X 10_15_7"
    const osFamily = osRaw.split(';')[0]?.trim() ?? osRaw
    return `${browser} / ${osFamily}`
  }

  // Fallback: truncate to first 40 chars
  if (ua.length <= 40) {
    return ua
  }
  return `${ua.slice(0, 40)}…`
}
