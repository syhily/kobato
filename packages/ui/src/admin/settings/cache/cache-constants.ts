// Numeric/text constants shared across the cache settings UI (form,
// validators, display helpers) without circular imports.

import { FIXED_CACHE_PREFIXES } from '@kobato/shared/cache/registry'

export const SECONDS_PER_HOUR = 60 * 60
export const MIN_TTL_HOURS = 1
export const MAX_TTL_HOURS = 24 * 30

// Mirror of the server-side conflict checks in `cacheSchema` — UX hints
// only; the server stays the authoritative validator.
export const PREFIX_PATTERN = /^[a-z0-9_-]+:$/i
export const RESERVED_PREFIXES: readonly string[] = [
  'session:',
  'rate-limit:',
  'avatar-status:',
  ...FIXED_CACHE_PREFIXES,
]
