import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { RATE_LIMIT_BUCKET_KEYS } from '@/server/domains/settings/sections/rate-limit'
import { rateLimitDefaults } from '@/shared/config/defaults'
import { BUCKET_META } from '@/ui/admin/settings/rate-limit/constants'

// Contract: the rate-limit bucket set is enumerated in several places
// that MUST stay in lock-step (P1-26):
//
//   - `rateLimitDefaults` (`@/shared/config/defaults`) — the source of
//     truth: install seed, settings backfill, and the infra limiter's
//     pre-hydration fallback.
//   - `RATE_LIMIT_BUCKET_KEYS` (`@/server/domains/settings/sections/
//     rate-limit`) — the z.object shape of the section schema; a key
//     missing here is silently stripped on parse.
//   - `BUCKET_META` (`@/ui/admin/settings/rate-limit/constants`) — the
//     admin form's per-bucket copy; a key missing here is invisible in
//     the UI.
//   - The `readBucket('<name>')` call sites in `@/server/infra/
//     rate-limit` — the limiter's real bucket set. The dangerous drift
//     direction: infra adds a bucket while defaults/UI don't follow —
//     the fallback lookup returns undefined and a NaN window means the
//     limiter never trips.
//
// `RateLimitSettings` (`@/shared/config/types`) has no runtime
// presence; its parity with `rateLimitDefaults` is pinned at compile
// time by the Assert/Equals check in `shared/config/defaults.ts`.

/** Bucket names the infra limiter actually reads, from its source. */
function infraBucketNames(): string[] {
  const source = readFileSync('src/server/infra/rate-limit.ts', 'utf8')
  const names = [...source.matchAll(/readBucket\('([A-Za-z]+)'\)/g)].map((match) => match[1])
  expect(names.length).toBeGreaterThan(0)
  return [...new Set(names)].sort()
}

describe('contract: rate-limit bucket sets stay in parity', () => {
  const expected = Object.keys(rateLimitDefaults).sort()

  it('RATE_LIMIT_BUCKET_KEYS enumerates exactly the defaults keys', () => {
    expect([...RATE_LIMIT_BUCKET_KEYS].sort()).toEqual(expected)
  })

  it('BUCKET_META enumerates exactly the defaults keys', () => {
    expect(Object.keys(BUCKET_META).sort()).toEqual(expected)
  })

  it('the infra limiter reads exactly the defaults keys', () => {
    expect(infraBucketNames()).toEqual(expected)
  })
})
