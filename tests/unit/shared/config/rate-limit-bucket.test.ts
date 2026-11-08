import { describe, expect, it } from 'vitest'

import { rateLimitBounds } from '@/shared/config/defaults'
import {
  rateLimitBucketMessages,
  rateLimitBucketSchema,
  upgradeLegacyRateLimitBuckets,
} from '@/shared/config/rate-limit-bucket'

// The server section schema and the admin ThresholdForm both compose this
// bucket schema — its custom messages are typed UI-catalog ids (the client
// translates them, the server maps them into descriptors), and the bound
// travels as the issue's `minimum`/`maximum`, never baked into prose.
describe('shared/config/rate-limit-bucket', () => {
  it('accepts the boundary values', () => {
    for (const [windowSeconds, maxAttempts] of [
      [rateLimitBounds.windowSeconds.min, rateLimitBounds.maxAttempts.min],
      [rateLimitBounds.windowSeconds.max, rateLimitBounds.maxAttempts.max],
    ]) {
      expect(rateLimitBucketSchema.safeParse({ windowSeconds, maxAttempts }).success).toBe(true)
    }
  })

  it('rejects an over-bound maxAttempts with the typed id and the bound', () => {
    const result = rateLimitBucketSchema.safeParse({ windowSeconds: 300, maxAttempts: 1001 })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({
      message: rateLimitBucketMessages.attemptsMax,
      path: ['maxAttempts'],
      maximum: rateLimitBounds.maxAttempts.max,
    })
  })

  it('rejects an under-bound windowSeconds with the typed id and the bound', () => {
    const result = rateLimitBucketSchema.safeParse({ windowSeconds: 59, maxAttempts: 5 })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({
      message: rateLimitBucketMessages.windowMin,
      path: ['windowSeconds'],
      minimum: rateLimitBounds.windowSeconds.min,
    })
  })

  it('rejects non-integer values with the typed id', () => {
    const result = rateLimitBucketSchema.safeParse({ windowSeconds: 300.5, maxAttempts: 5 })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({
      message: rateLimitBucketMessages.windowInteger,
      path: ['windowSeconds'],
    })
  })
})

describe('shared/config/upgradeLegacyRateLimitBuckets', () => {
  it('maps every legacy twin onto its merged bucket, keeping the stricter values', () => {
    const legacy = {
      signInIp: { windowSeconds: 1800, maxAttempts: 5 },
      signInEmail: { windowSeconds: 1800, maxAttempts: 3 },
      commentPostIp: { windowSeconds: 3600, maxAttempts: 12 },
      commentPostEmail: { windowSeconds: 3600, maxAttempts: 8 },
      likeIncreaseIp: { windowSeconds: 3600, maxAttempts: 30 },
      inviteIp: { windowSeconds: 3600, maxAttempts: 5 },
      inviteEmail: { windowSeconds: 3600, maxAttempts: 1 },
      passwordResetIp: { windowSeconds: 1800, maxAttempts: 3 },
      passwordResetEmail: { windowSeconds: 300, maxAttempts: 1 },
      passwordResetTarget: { windowSeconds: 60, maxAttempts: 1 },
      resourceIp: { windowSeconds: 60, maxAttempts: 60 },
      otpSendIp: { windowSeconds: 300, maxAttempts: 3 },
      otpSendEmail: { windowSeconds: 300, maxAttempts: 1 },
      otpVerifyIp: { windowSeconds: 300, maxAttempts: 5 },
      otpVerifyEmail: { windowSeconds: 300, maxAttempts: 5 },
      passkeyAuthBeginIp: { windowSeconds: 300, maxAttempts: 10 },
      passkeyAuthFinishIp: { windowSeconds: 300, maxAttempts: 10 },
      passkeyRegisterBeginIp: { windowSeconds: 300, maxAttempts: 10 },
      passkeyRegisterFinishIp: { windowSeconds: 300, maxAttempts: 10 },
      passkeySetForceIp: { windowSeconds: 300, maxAttempts: 10 },
      passkeyDeleteIp: { windowSeconds: 300, maxAttempts: 10 },
    }
    expect(upgradeLegacyRateLimitBuckets(legacy)).toMatchObject({
      signIn: { windowSeconds: 1800, maxAttempts: 3 },
      comment: { windowSeconds: 3600, maxAttempts: 8 },
      like: { windowSeconds: 3600, maxAttempts: 30 },
      invite: { windowSeconds: 3600, maxAttempts: 1 },
      passwordReset: { windowSeconds: 300, maxAttempts: 1 },
      passwordResetTarget: { windowSeconds: 60, maxAttempts: 1 },
      resource: { windowSeconds: 60, maxAttempts: 60 },
      otpSend: { windowSeconds: 300, maxAttempts: 1 },
      otpVerify: { windowSeconds: 300, maxAttempts: 5 },
      passkeyAuth: { windowSeconds: 300, maxAttempts: 10 },
      passkeyManage: { windowSeconds: 300, maxAttempts: 10 },
    })
  })

  it('prefers fewer attempts, then the longer window on ties', () => {
    expect(
      upgradeLegacyRateLimitBuckets({
        signInIp: { windowSeconds: 300, maxAttempts: 5 },
        signInEmail: { windowSeconds: 1800, maxAttempts: 5 },
      }),
    ).toMatchObject({ signIn: { windowSeconds: 1800, maxAttempts: 5 } })
    expect(
      upgradeLegacyRateLimitBuckets({
        signInIp: { windowSeconds: 300, maxAttempts: 3 },
        signInEmail: { windowSeconds: 1800, maxAttempts: 5 },
      }),
    ).toMatchObject({ signIn: { windowSeconds: 300, maxAttempts: 3 } })
  })

  it('keeps the new key when both shapes are present', () => {
    expect(
      upgradeLegacyRateLimitBuckets({
        signIn: { windowSeconds: 600, maxAttempts: 7 },
        signInIp: { windowSeconds: 1800, maxAttempts: 3 },
      }),
    ).toMatchObject({ signIn: { windowSeconds: 600, maxAttempts: 7 } })
  })

  it('ignores malformed legacy entries and returns non-objects untouched', () => {
    expect(upgradeLegacyRateLimitBuckets({ likeIncreaseIp: { windowSeconds: '60' }, resourceIp: null })).toEqual({
      likeIncreaseIp: { windowSeconds: '60' },
      resourceIp: null,
    })
    expect(upgradeLegacyRateLimitBuckets('nope')).toBe('nope')
    expect(upgradeLegacyRateLimitBuckets(null)).toBe(null)
  })
})
