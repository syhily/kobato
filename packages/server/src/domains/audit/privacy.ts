// L3 (direct identifier) privacy tagging for audit-log `details`.
// Uses the same L3 key set as `@kobato/server/infra/logger.ts` so audit rows
// carry the same `{E}…{/E}` markers as stdout log lines.

import { L3_KEYS } from '@kobato/server/infra/logger'
import { isRecord } from '@kobato/shared/utils/type-guards'

const L3_OPEN = '{E}'
const L3_CLOSE = '{/E}'

// Audit-log details should NOT tag generic 'name' keys (category names,
// tag names, etc.) even though the logger does tag them.
const AUDIT_L3_KEYS = new Set([...L3_KEYS].filter((k) => k !== 'name'))

// Tagging — wraps L3 values in {E}…{/E}

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

/**
 * Recursively walk a details object and wrap every string value whose
 * key matches the L3 set in `{E}…{/E}` markers.
 *
 * Arrays are walked element-by-element (the element index is NOT treated
 * as a key, so nested objects inside arrays are still traversed).
 */
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

// Stripping — removes {E}…{/E} wrappers for display

/**
 * Check whether a string is wrapped in `{E}…{/E}`.
 */
export function isL3Tagged(value: string): boolean {
  return value.startsWith(L3_OPEN) && value.endsWith(L3_CLOSE)
}

/**
 * Strip the `{E}…{/E}` wrapper from a single tagged string.
 * Returns the inner value.
 */
export function stripL3(value: string): string {
  if (!isL3Tagged(value)) {
    return value
  }
  return value.slice(L3_OPEN.length, -L3_CLOSE.length)
}

/**
 * Recursively walk any value and replace every `{E}…{/E}` wrapped string
 * with a masked placeholder (`***`).
 *
 * Used before serialising audit rows for API responses / CSV export.
 */
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
