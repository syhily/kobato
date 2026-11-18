// Gravatar-compatible avatar mirrors. The admin-configurable mirror URL is
// fetched by a public endpoint, so the host allowlist is the security boundary:
// the server's outbound fetch still applies its SSRF/DNS guard on every hop.
const ALLOWED_GRAVATAR_HOSTS = new Set([
  'gravatar.com',
  'www.gravatar.com',
  'cn.gravatar.com',
  'en.gravatar.com',
  'secure.gravatar.com',
  'i.gravatar.com',
  // Public mirrors; keep the list explicit — never open it to arbitrary hosts.
  'cdn.v2ex.com',
  'sdn.geekzu.org',
  'gravatar.loli.net',
  'cravatar.cn',
  'cravatar.com',
  'seccdn.libravatar.org',
  'weavatar.com',
  'gravatar.webp.se',
  'gravatar.zeruns.com',
  'gravatar.zeruns.tech',
  'cdn.sep.cc',
  'gravatar.w3tt.com',
  'use.sevencdn.com',
])

/**
 * Preset mirror base URLs on allowlisted hosts. URLs only: labels live in the
 * admin settings layer (this module is part of the public avatar graph and must
 * not carry workspace catalog ids). The allowlist above stays the superset — a
 * configured mirror outside these presets is appended as a custom option.
 */
export const GRAVATAR_MIRROR_URLS = [
  'https://www.gravatar.com/avatar',
  'https://cn.gravatar.com/avatar',
  'https://secure.gravatar.com/avatar',
  'https://gravatar.loli.net/avatar',
  'https://sdn.geekzu.org/avatar',
  'https://cdn.v2ex.com/gravatar',
  'https://cravatar.cn/avatar',
  'https://cravatar.com/avatar',
  'https://seccdn.libravatar.org/gravatarproxy',
  'https://weavatar.com/avatar',
  'https://gravatar.webp.se/avatar',
  'https://gravatar.zeruns.com/avatar',
  'https://gravatar.zeruns.tech/avatar',
  'https://cdn.sep.cc/avatar',
  'https://gravatar.w3tt.com/avatar',
  'https://use.sevencdn.com/avatar',
] as const

export type GravatarMirrorUrl = (typeof GRAVATAR_MIRROR_URLS)[number]

/** HTTPS on a known mirror host. Host literals/IPs can never be in the
 *  allowlist, so private and metadata addresses are rejected here as well. */
export function isAllowedMirrorUrl(rawUrl: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') {
    return false
  }
  return ALLOWED_GRAVATAR_HOSTS.has(parsed.hostname.toLowerCase())
}
