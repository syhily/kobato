// L3 (direct identifier) tagging for audit-log `details`; key set shared
// with `@/server/infra/logger.ts` (`{E}…{/E}` markers).

import { L3_KEYS } from '@kobato/server/infra/logger.ts'
import { isRecord } from '@kobato/utils/type-guards.ts'

const L3_OPEN = '{E}'
const L3_CLOSE = '{/E}'

// Unlike the logger, never tag generic 'name' keys.
const AUDIT_L3_KEYS = new Set([...L3_KEYS].filter((k) => k !== 'name'))

function tagL3(value: string): string {
  if (value === '') {
    return value
  }
  return `${L3_OPEN}${value}${L3_CLOSE}`
}

function isAlreadyTagged(value: string): boolean {
  return value.startsWith(L3_OPEN) && value.endsWith(L3_CLOSE)
}

function shouldTagKey(key: string): boolean {
  return AUDIT_L3_KEYS.has(key)
}

function tagValue(key: string, value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }
  if (!shouldTagKey(key) || isAlreadyTagged(value)) {
    return value
  }
  return tagL3(value)
}

/** Wrap string values whose key matches the L3 set; array elements keep the parent key. */
export function tagL3InDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (details === undefined || details === null) {
    return details
  }

  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(details)) {
    out[key] = tagValueRecursive(key, value)
  }
  return out
}

function tagValueRecursive(key: string, value: unknown): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'string') {
    return tagValue(key, value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => tagValueRecursive(key, item))
  }

  if (isRecord(value)) {
    return tagL3InDetails(value)
  }

  return value
}

export function isL3Tagged(value: string): boolean {
  return value.startsWith(L3_OPEN) && value.endsWith(L3_CLOSE)
}

export function stripL3Markers(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'string') {
    return isL3Tagged(value) ? '***' : value
  }

  if (Array.isArray(value)) {
    return value.map(stripL3Markers)
  }

  if (isRecord(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = stripL3Markers(v)
    }
    return out
  }

  return value
}

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
