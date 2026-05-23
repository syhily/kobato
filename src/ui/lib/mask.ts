/**
 * Mask sensitive identifiers for admin display. The full values remain
 * in the database for moderation use, but the admin UI shows masked
 * versions to prevent accidental exposure (screenshots, screen shares,
 * non-superadmin roles).
 */

export function maskIp(ip: string | null | undefined): string | null {
  if (!ip) {
    return null
  }
  // IPv4: 192.168.1.42 → 192.168.*.*
  if (ip.includes('.')) {
    const parts = ip.split('.')
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.*.*`
    }
  }
  // IPv6: keep first two groups, mask the rest
  if (ip.includes(':')) {
    const groups = ip.split(':')
    if (groups.length >= 3) {
      return `${groups[0]}:${groups[1]}:****`
    }
  }
  // Fallback: show first 4 chars + mask
  return ip.length > 4 ? `${ip.slice(0, 4)}****` : '****'
}

export function maskUa(ua: string | null | undefined): string | null {
  if (!ua) {
    return null
  }
  return ua.length > 50 ? `${ua.substring(0, 50)}...` : ua
}
