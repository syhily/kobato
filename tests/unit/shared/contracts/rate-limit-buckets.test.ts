import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { RATE_LIMIT_BUCKET_KEYS } from '@/server/domains/settings/sections/rate-limit'
import { rateLimitDefaults } from '@/shared/config/defaults'
import { BUCKET_META } from '@/ui/admin/settings/rate-limit/constants'

// Contract (P1-26): the rate-limit bucket set stays in lock-step across
// defaults, section schema, UI copy, and the infra limiter. Type-level
// parity of `RateLimitSettings` is pinned at compile time in defaults.ts.

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
