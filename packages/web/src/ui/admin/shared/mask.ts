export function maskIp(ip: string | null | undefined): string | null {
  if (!ip) {
    return null
  }
  if (ip.includes('.')) {
    const parts = ip.split('.')
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.*.*`
    }
  }
  if (ip.includes(':')) {
    const groups = ip.split(':')
    if (groups.length >= 3) {
      return `${groups[0]}:${groups[1]}:****`
    }
  }
  return ip.length > 4 ? `${ip.slice(0, 4)}****` : '****'
}

export function maskUa(ua: string | null | undefined): string | null {
  if (!ua) {
    return null
  }
  return ua.length > 50 ? `${ua.substring(0, 50)}...` : ua
}
