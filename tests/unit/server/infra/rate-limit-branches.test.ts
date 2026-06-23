import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the redis pipeline so we can inspect which key each bucket helper
// forwards to `tryKeyedRateLimit`, and control the post-INCR count to drive
// both the allow and the exceed branches.
const mockPipeline = {
  incr: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: vi.fn(),
}

const mockRedis = {
  pipeline: vi.fn(() => mockPipeline),
}

vi.mock('@/server/infra/redis/storage', () => ({
  redisInstance: () => mockRedis,
}))

import {
  tryCommentPostRateLimit,
  tryCommentPostRateLimitByEmail,
  tryInviteByEmailRateLimit,
  tryInviteRateLimit,
  tryLikeIncreaseRateLimit,
  tryOtpSendByEmailRateLimit,
  tryOtpSendRateLimit,
  tryOtpVerifyByEmailRateLimit,
  tryOtpVerifyRateLimit,
  tryPasskeyAuthBeginRateLimit,
  tryPasskeyAuthFinishRateLimit,
  tryPasskeyDeleteRateLimit,
  tryPasskeyRegisterBeginRateLimit,
  tryPasskeyRegisterFinishRateLimit,
  tryPasskeySetForceRateLimit,
  tryPasswordResetByEmailRateLimit,
  tryPasswordResetByTargetRateLimit,
  tryPasswordResetRateLimit,
  tryRateLimit,
  tryRenderRateLimit,
  tryResourceRateLimit,
  trySignInByEmailRateLimit,
} from '@/server/infra/rate-limit'

describe('rate-limit — bucket routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPipeline.exec.mockResolvedValue([[null, 1]])
  })

  // Each bucket helper should derive a *distinct* key namespace so two
  // unrelated throttles don't share a counter. Asserting the captured key
  // pins both the key constructor and the bucket selection in `readBucket`.
  it('routes IP-bound buckets to distinct keys', async () => {
    await tryRateLimit('1.1.1.1')
    await tryInviteRateLimit('1.1.1.1')
    await tryPasswordResetRateLimit('1.1.1.1')
    await tryCommentPostRateLimit('1.1.1.1')
    await tryLikeIncreaseRateLimit('1.1.1.1')
    await tryResourceRateLimit('1.1.1.1')
    await tryOtpSendRateLimit('1.1.1.1')
    await tryOtpVerifyRateLimit('1.1.1.1')
    await tryPasskeyAuthBeginRateLimit('1.1.1.1')
    await tryPasskeyAuthFinishRateLimit('1.1.1.1')
    await tryPasskeyRegisterBeginRateLimit('1.1.1.1')
    await tryPasskeyRegisterFinishRateLimit('1.1.1.1')
    await tryPasskeySetForceRateLimit('1.1.1.1')
    await tryPasskeyDeleteRateLimit('1.1.1.1')
    await tryRenderRateLimit('1.1.1.1')

    const keys = mockPipeline.incr.mock.calls.map((c) => c[0] as string)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of keys) {
      expect(k.startsWith('rate-limit:')).toBe(true)
    }
    // Spot-check the namespaces we know about.
    expect(keys).toEqual(
      expect.arrayContaining([
        'rate-limit:signin:1.1.1.1',
        'rate-limit:invite:1.1.1.1',
        'rate-limit:password-reset:1.1.1.1',
        'rate-limit:comment-post:1.1.1.1',
        'rate-limit:like-increase:1.1.1.1',
        'rate-limit:resource:1.1.1.1',
        'rate-limit:otp-send:1.1.1.1',
        'rate-limit:otp-verify:1.1.1.1',
        'rate-limit:passkey-auth-begin:1.1.1.1',
        'rate-limit:passkey-auth-finish:1.1.1.1',
        'rate-limit:passkey-register-begin:1.1.1.1',
        'rate-limit:passkey-register-finish:1.1.1.1',
        'rate-limit:passkey-set-force:1.1.1.1',
        'rate-limit:passkey-delete:1.1.1.1',
        'rate-limit:render:1.1.1.1',
      ]),
    )
  })

  it('routes email-bound buckets to hashed keys (never raw email)', async () => {
    const email = 'User@Example.COM'
    await trySignInByEmailRateLimit(email)
    await tryCommentPostRateLimitByEmail(email)
    await tryPasswordResetByEmailRateLimit(email)
    await tryOtpSendByEmailRateLimit(email)
    await tryOtpVerifyByEmailRateLimit(email)

    const keys = mockPipeline.incr.mock.calls.map((c) => c[0] as string)
    // Raw email (or unnormalized casing) must never appear in the key.
    for (const k of keys) {
      expect(k).not.toContain(email)
      expect(k).not.toContain(email.toLowerCase())
      expect(k).not.toContain('User@Example.COM')
    }
    // Each distinct namespace should still produce a unique key.
    expect(new Set(keys).size).toBe(keys.length)
    // Two calls with the same email must hash identically (idempotent hash).
    mockPipeline.incr.mockClear()
    await trySignInByEmailRateLimit(email)
    await trySignInByEmailRateLimit('user@example.com')
    const hashed = mockPipeline.incr.mock.calls.map((c) => c[0] as string)
    expect(hashed[0]).toBe(hashed[1])
  })

  it('routes admin+email and target-user-id buckets to their namespaces', async () => {
    await tryInviteByEmailRateLimit(42n, 'admin+peer@example.com')
    await tryPasswordResetByTargetRateLimit(99n)

    const keys = mockPipeline.incr.mock.calls.map((c) => c[0] as string)
    expect(keys[0].startsWith('rate-limit:invite-email:42:')).toBe(true)
    expect(keys[0]).not.toContain('admin+peer@example.com')
    expect(keys[1]).toBe('rate-limit:password-reset-target:99')
  })

  it('passes the windowSeconds TTL through EXPIRE … NX', async () => {
    await tryResourceRateLimit('10.0.0.1')
    const [, ttl, mode] = mockPipeline.expire.mock.calls[0]
    expect(ttl).toBe(60)
    expect(mode).toBe('NX')
  })
})

describe('rate-limit — exceed branch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports exceeded=true when the count strictly exceeds maxAttempts', async () => {
    // resourceIp default maxAttempts is 60, so 61 should trip.
    mockPipeline.exec.mockResolvedValue([[null, 61]])

    const result = await tryResourceRateLimit('8.8.8.8')

    expect(result.count).toBe(61)
    expect(result.exceeded).toBe(true)
  })

  it('reports exceeded=false exactly at the threshold (count === maxAttempts)', async () => {
    // inviteEmail has maxAttempts=1; count of 1 is allowed (strict >).
    mockPipeline.exec.mockResolvedValue([[null, 1]])

    const result = await tryInviteByEmailRateLimit(7n, 'a@b.c')

    expect(result.count).toBe(1)
    expect(result.exceeded).toBe(false)
  })

  it('fails closed when the incr result entry is missing', async () => {
    mockPipeline.exec.mockResolvedValue(null)

    const result = await tryCommentPostRateLimit('203.0.113.9')

    expect(result.exceeded).toBe(true)
    expect(result.count).toBe(Number.POSITIVE_INFINITY)
  })

  it('fails closed when the incr result entry reports an error', async () => {
    mockPipeline.exec.mockResolvedValue([[new Error('boom'), null]])

    const result = await tryLikeIncreaseRateLimit('198.51.100.7')

    expect(result.exceeded).toBe(true)
    expect(result.count).toBe(Number.POSITIVE_INFINITY)
  })
})
