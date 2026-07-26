// Numeric/text constants reused across the cache settings UI. Pulled
// out of `CacheView.tsx` so the form, validators, and display
// helpers can share a single source of truth without circular
// imports.

import { FIXED_CACHE_PREFIXES } from '@/shared/cache/registry'

export const SECONDS_PER_HOUR = 60 * 60
export const MIN_TTL_HOURS = 1
export const MAX_TTL_HOURS = 24 * 30

// Mirror of the server-side conflict checks in `cacheSchema`. The
// authoritative validation lives on the server — these are UX hints
// so the editor sees the problem before clicking save.
export const PREFIX_PATTERN = /^[a-z0-9_-]+:$/i
export const RESERVED_PREFIXES: readonly string[] = [
  'session:',
  'rate-limit:',
  'avatar-status:',
  ...FIXED_CACHE_PREFIXES,
]
