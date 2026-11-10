import { z } from 'zod'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

/**
 * Typed catalog id for the shared http(s)-URL rule: every schema reusing the
 * rule emits the same descriptor, never raw prose or a bare key.
 */
export const HTTP_URL_MESSAGE = 'common.error.httpUrlRequired' satisfies UiMessageId

// Control characters in a redirect target are never legitimate: the URL
// parser silently strips some (tab/newline) and percent-encodes others, so
// reject the raw value before either can reshape the path.
function hasControlChar(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0)
    if (code !== undefined && (code <= 0x1f || code === 0x7f)) {
      return true
    }
  }
  return false
}

export function safeHref(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  const trimmed = value.trim()
  if (trimmed === '') {
    return undefined
  }
  return isHttpUrl(trimmed) ? trimmed : undefined
}

export function safeRedirectPath(value: string | null | undefined, fallback: string, origin: string): string {
  if (value === null || value === undefined) {
    return fallback
  }
  const trimmed = value.trim()
  if (trimmed === '' || hasControlChar(trimmed)) {
    return fallback
  }

  try {
    const base = new URL(origin)
    const url = new URL(trimmed, base)
    if (url.origin !== base.origin) {
      return fallback
    }
    // Dot-segment normalization can rewrite a single-slash input into a
    // network-path reference (`/..//evil.com` → `//evil.com`), which the
    // browser resolves as a cross-origin URL. Only a single-slash path is
    // same-origin.
    if (!url.pathname.startsWith('/') || url.pathname.startsWith('//')) {
      return fallback
    }
    const path = `${url.pathname}${url.search}${url.hash}`
    return hasControlChar(path) ? fallback : path
  } catch {
    return fallback
  }
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const httpUrlSchema = z.url().refine(isHttpUrl, { message: HTTP_URL_MESSAGE })

export const optionalHttpUrlSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}, httpUrlSchema.optional())

export function tryParseUrl(raw: string): URL | null {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

/** URL shape safe for logs: origin + pathname only. Userinfo, query, and
 *  fragment are dropped — signed CDN URLs carry credentials in the query
 *  string that must never reach a log line. */
export function redactUrlForLog(raw: string): string {
  const parsed = tryParseUrl(raw)
  if (parsed === null) {
    return '<unparsable>'
  }
  return `${parsed.origin}${parsed.pathname}`
}

const IPV4_PRIVATE = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|127\.|169\.254\.|0\.|22[4-9]\.|2[3-5][0-9]\.)/

/** One dotted-quad segment per the WHATWG IPv4 rules: decimal by
 *  default, `0x`-prefixed hex, `0`-prefixed octal. Null when the
 *  segment is not numeric in its radix (a name, not an IP literal). */
function parseIpv4Segment(segment: string): number | null {
  if (segment === '') {
    return null
  }
  let digits = segment
  let radix = 10
  if (segment.length >= 2 && segment[0] === '0' && (segment[1] === 'x' || segment[1] === 'X')) {
    digits = segment.slice(2)
    radix = 16
    if (!/^[0-9a-fA-F]+$/.test(digits)) {
      return null
    }
  } else if (segment.length >= 2 && segment[0] === '0') {
    digits = segment.slice(1)
    radix = 8
    if (!/^[0-7]+$/.test(digits)) {
      return null
    }
  } else if (!/^[0-9]+$/.test(digits)) {
    return null
  }
  return Number.parseInt(digits, radix)
}

/** IPv4 literal in any WHATWG spelling (dotted, short-dot, hex,
 *  octal, decimal integer) → 32-bit value; null for non-IP hosts. */
function parseIpv4(host: string): number | null {
  const input = host.endsWith('.') ? host.slice(0, -1) : host
  const segments = input.split('.')
  if (segments.length > 4) {
    return null
  }
  const numbers: number[] = []
  for (const segment of segments) {
    const value = parseIpv4Segment(segment)
    if (value === null) {
      return null
    }
    numbers.push(value)
  }
  // The last segment fills all remaining bytes, the rest must fit in one.
  const last = numbers[numbers.length - 1]
  if (last >= 256 ** (5 - numbers.length)) {
    return null
  }
  for (let i = 0; i < numbers.length - 1; i++) {
    if (numbers[i] > 255) {
      return null
    }
  }
  let ip = last
  for (let i = 0; i < numbers.length - 1; i++) {
    ip += numbers[i] * 256 ** (3 - i)
  }
  return ip
}

/** IPv4 ranges an outbound fetch must never target. Per-entry comments name
 *  each range; the two cloud-metadata addresses are called out there. */
const BLOCKED_IPV4_CIDRS: ReadonlyArray<{ base: number; prefix: number }> = [
  { base: 0x00000000, prefix: 8 }, // 0.0.0.0/8 this network
  { base: 0x0a000000, prefix: 8 }, // 10.0.0.0/8
  { base: 0x64400000, prefix: 10 }, // 100.64.0.0/10 CGNAT (cloud metadata: 100.100.100.200)
  { base: 0x7f000000, prefix: 8 }, // 127.0.0.0/8 loopback
  { base: 0xa9fe0000, prefix: 16 }, // 169.254.0.0/16 link-local (169.254.169.254 metadata)
  { base: 0xac100000, prefix: 12 }, // 172.16.0.0/12
  { base: 0xc0000000, prefix: 24 }, // 192.0.0.0/24 IETF protocol assignments
  { base: 0xc0a80000, prefix: 16 }, // 192.168.0.0/16
  { base: 0xc6120000, prefix: 15 }, // 198.18.0.0/15 benchmarking
  { base: 0xe0000000, prefix: 3 }, // 224.0.0.0/3 multicast + reserved + broadcast
]

function ipv4InCidr(ip: number, base: number, prefix: number): boolean {
  const shift = 32 - prefix
  return ip >>> shift === base >>> shift
}

/** Private/reserved check on a 32-bit IPv4 value. The CIDR table is the
 *  authoritative numeric verdict; `IPV4_PRIVATE` is only the name-level
 *  fast path (`127.0.0.1.nip.io`) and deliberately stays narrow. */
function isPrivateIpv4Number(ip: number): boolean {
  return BLOCKED_IPV4_CIDRS.some(({ base, prefix }) => ipv4InCidr(ip, base, prefix))
}

/** One side of a (possibly `::`-compressed) IPv6 address into hextets;
 *  a dotted IPv4 tail is only allowed as the final group. */
function parseIpv6Hextets(groups: string[], allowIpv4Tail: boolean): number[] | null {
  const hextets: number[] = []
  for (const [index, group] of groups.entries()) {
    if (group.includes('.')) {
      if (!allowIpv4Tail || index !== groups.length - 1) {
        return null
      }
      const v4 = parseIpv4(group)
      if (v4 === null) {
        return null
      }
      hextets.push(Math.floor(v4 / 0x10000), v4 % 0x10000)
      continue
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
      return null
    }
    hextets.push(Number.parseInt(group, 16))
  }
  return hextets
}

/** IPv6 literal (compressed or full, with optional IPv4 tail) → its 8
 *  hextets; null for malformed input. A zone-ID suffix is stripped
 *  first — the address alone decides the private/reserved verdict. */
function parseIpv6(host: string): number[] | null {
  const zoneIndex = host.indexOf('%')
  const address = zoneIndex === -1 ? host : host.slice(0, zoneIndex)
  const halves = address.split('::')
  if (halves.length > 2) {
    return null
  }
  const head = halves[0] === '' ? [] : halves[0].split(':')
  const tail = halves.length === 2 ? (halves[1] === '' ? [] : halves[1].split(':')) : []
  const headHextets = parseIpv6Hextets(head, tail.length === 0)
  const tailHextets = parseIpv6Hextets(tail, true)
  if (headHextets === null || tailHextets === null) {
    return null
  }
  if (halves.length === 1) {
    return headHextets.length === 8 ? headHextets : null
  }
  const zeros = 8 - headHextets.length - tailHextets.length
  if (zeros < 1) {
    return null
  }
  return [...headHextets, ...Array.from<number>({ length: zeros }).fill(0), ...tailHextets]
}

/** Private/reserved check on parsed IPv6 hextets: loopback `::1`,
 *  unspecified `::`, ULA fc00::/7, link-local fe80::/10, multicast
 *  ff00::/8 (an outbound fetch must never target a multicast group),
 *  the IPv4-mapped `::ffff:a.b.c.d` range (inner IPv4 goes through the
 *  same private check), and the two IPv4-embedding transition
 *  prefixes — NAT64 `64:ff9b::/96` (`64:ff9b::a9fe:a9fe` is
 *  169.254.169.254) and 6to4 `2002::/16` (`2002:7f00:1::` is
 *  127.0.0.1). */
function isPrivateIpv6(hextets: number[]): boolean {
  const first = hextets[0]
  if ((first & 0xff00) === 0xff00) {
    return true
  }
  if ((first & 0xfe00) === 0xfc00) {
    return true
  }
  if ((first & 0xffc0) === 0xfe80) {
    return true
  }
  if (first === 0x0064 && hextets[1] === 0xff9b && hextets.slice(2, 6).every((h) => h === 0)) {
    return true
  }
  if (first === 0x2002) {
    return true
  }
  if (hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff) {
    return isPrivateIpv4Number(hextets[6] * 0x10000 + hextets[7])
  }
  // IPv4-compatible IPv6 (`::a.b.c.d`, RFC 4291 §2.5.5.1) is not
  // special-cased: current runtimes don't route it.
  return hextets.every((h, i) => h === (i === 7 ? 1 : 0)) || hextets.every((h) => h === 0)
}

/** SSRF guard: hostnames that must never be the target of an
 *  admin-influenced outbound fetch. */
export function isBlockedFetchHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host === '[::1]' || host.endsWith('.localhost')) {
    return true
  }
  return isPrivateIp(host)
}

/** Private/reserved IP check — domain names are never flagged. Literal regex
 *  first (also catches names like `127.0.0.1.nip.io`), then the parser
 *  spellings the regex cannot see; handles bracketed IPv6. */
export function isPrivateIp(hostname: string): boolean {
  const h = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
  if (IPV4_PRIVATE.test(h)) {
    return true
  }
  if (h.includes(':')) {
    const hextets = parseIpv6(h)
    return hextets !== null && isPrivateIpv6(hextets)
  }
  const v4 = parseIpv4(h)
  return v4 !== null && isPrivateIpv4Number(v4)
}

export const httpUrlOrEmptyStringSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) {
      return ''
    }
    if (typeof value !== 'string') {
      return value
    }
    const trimmed = value.trim()
    return trimmed === '' ? '' : trimmed
  },
  z.union([z.literal(''), httpUrlSchema]),
)

/** Passkey RP requirements: HTTPS + public hostname (no localhost /
 *  private IP / IPv6 ULA). */
export function isValidPasskeyDomain(website: string): boolean {
  try {
    const url = new URL(website)
    if (url.protocol !== 'https:') {
      return false
    }
    const hostname = url.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') {
      return false
    }
    return !isPrivateIp(hostname)
  } catch {
    return false
  }
}

// Known Gravatar-compatible mirrors; the admin-configurable mirror URL
// is fetched by a public endpoint, so the allowlist blocks SSRF.
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

/** HTTPS on a known mirror host that is not private — a DNS rebinding
 *  of an allowed name to an internal IP must not slip through. */
export function isAllowedMirrorUrl(rawUrl: string): boolean {
  const parsed = tryParseUrl(rawUrl)
  if (parsed === null) {
    return false
  }
  if (parsed.protocol !== 'https:') {
    return false
  }
  const host = parsed.hostname.toLowerCase()
  if (!ALLOWED_GRAVATAR_HOSTS.has(host)) {
    return false
  }
  return !isPrivateIp(host)
}
