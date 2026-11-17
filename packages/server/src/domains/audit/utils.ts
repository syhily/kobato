export function maskIp(ip: string | null | undefined): string {
  if (!ip) {
    return ''
  }

  // IPv4-mapped IPv6: ::ffff:192.168.1.1
  const mappedMatch = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)
  if (mappedMatch) {
    const v4 = mappedMatch[1]
    const parts = v4.split('.')
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.x.x`
    }
    return v4
  }

  if (ip.includes('.')) {
    const parts = ip.split('.')
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.x.x`
    }
    return ip
  }

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

export function maskUserAgent(ua: string | null | undefined): string {
  if (!ua) {
    return ''
  }

  const browserMatch = /(Chrome|Firefox|Safari|Edge|Opera|Brave)\/[^\s]+/i.exec(ua)
  const osMatch = /\(([^)]+)\)/.exec(ua)

  if (browserMatch && osMatch) {
    const browser = browserMatch[1]
    const osRaw = osMatch[1]
    // osRaw often looks like "Windows NT 10.0; Win64; x64" or "Macintosh; Intel Mac OS X 10_15_7"
    const osFamily = osRaw.split(';')[0]?.trim() ?? osRaw
    return `${browser} / ${osFamily}`
  }

  if (ua.length <= 40) {
    return ua
  }
  return `${ua.slice(0, 40)}…`
}
