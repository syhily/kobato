import { rateLimitDefaults } from '@kobato/settings/rate-limit-defaults'
import { RATE_LIMIT_BUCKET_KEYS } from '@kobato/settings/sections/rate-limit'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { BUCKET_META } from '@/ui/settings/rate-limit/constants'

function infraBucketNames(): string[] {
  const source = readFileSync('packages/server/src/infra/rate-limit.ts', 'utf8')
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
