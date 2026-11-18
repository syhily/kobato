import { rateLimitDefaults } from '@kobato/settings/rate-limit-defaults.ts'
import { RATE_LIMIT_BUCKET_KEYS } from '@kobato/settings/sections/rate-limit.ts'
import { BUCKET_META } from '@kobato/web-admin/ui/settings/rate-limit/constants.ts'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Contract: the rate-limit bucket set stays in lock-step across defaults,
// section schema, UI copy, and the infra limiter. Type-level parity of
// `RateLimitSettings` is pinned at compile time in defaults.ts.

function infraBucketNames(): string[] {
  const source = readFileSync('packages/server/src/infra/rate-limit.ts', 'utf8')
  // Counter dimensions are built by the by* factories: byIp('bucket', ns) …
  const names = [...source.matchAll(/by(?:Ip|Email|UserId|AdminEmail)\('([A-Za-z]+)'/g)].map((match) => match[1])
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
