import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The counter map is in-process now, so bucket routing is observed
// through the test-only key snapshot instead of a mocked external
// store: asserting the tracked keys pins both the key constructors and
// the bucket selection in `readBucket`.
vi.mock('@/server/infra/logger', () => ({
  getLogger: vi.fn(() => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    child: vi.fn(function (this: unknown) {
      return this
    }),
  })),
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
  tryResourceRateLimit,
  trySignInByEmailRateLimit,
  __rateLimitKeysForTests,
  __resetRateLimitsForTests,
} from '@/server/infra/rate-limit'

const T0 = new Date('2026-01-01T00:00:00.000Z').getTime()

describe('rate-limit — bucket routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetRateLimitsForTests()
  })

  // Each bucket helper should derive a *distinct* key namespace so two
  // unrelated throttles don't share a counter.
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

    const keys = __rateLimitKeysForTests()
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

    const keys = __rateLimitKeysForTests()
    // Raw email (or unnormalized casing) must never appear in a key.
    for (const k of keys) {
      expect(k).not.toContain(email)
      expect(k).not.toContain(email.toLowerCase())
      expect(k).not.toContain('User@Example.COM')
    }
    // Each distinct namespace should still produce a unique key.
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('normalizes email casing and whitespace into the same counter', async () => {
    const first = await trySignInByEmailRateLimit('User@Example.COM')
    const second = await trySignInByEmailRateLimit('user@example.com')
    const third = await trySignInByEmailRateLimit('  user@example.com  ')
    expect(first.count).toBe(1)
    expect(second.count).toBe(2)
    expect(third.count).toBe(3)
    // One logical subject → one tracked key.
    expect(__rateLimitKeysForTests()).toHaveLength(1)
  })

  it('routes admin+email and target-user-id buckets to their namespaces', async () => {
    await tryInviteByEmailRateLimit(42n, 'admin+peer@example.com')
    await tryPasswordResetByTargetRateLimit(99n)

    const keys = __rateLimitKeysForTests()
    expect(keys[0].startsWith('rate-limit:invite-email:42:')).toBe(true)
    expect(keys[0]).not.toContain('admin+peer@example.com')
    expect(keys[1]).toBe('rate-limit:password-reset-target:99')
  })

  it('scopes invite-email counters per admin', async () => {
    const email = 'peer@example.com'
    expect((await tryInviteByEmailRateLimit(1n, email)).count).toBe(1)
    // Same mailbox, different admin → a fresh counter.
    expect((await tryInviteByEmailRateLimit(2n, email)).count).toBe(1)
    expect((await tryInviteByEmailRateLimit(1n, email)).count).toBe(2)
  })
})

describe('rate-limit — window + exceed branches', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    vi.clearAllMocks()
    __resetRateLimitsForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports exceeded=true when the count strictly exceeds maxAttempts', async () => {
    // resourceIp default maxAttempts is 60, so the 61st hit trips.
    for (let i = 0; i < 60; i += 1) {
      expect((await tryResourceRateLimit('8.8.8.8')).exceeded).toBe(false)
    }

    const result = await tryResourceRateLimit('8.8.8.8')

    expect(result.count).toBe(61)
    expect(result.exceeded).toBe(true)
  })

  it('reports exceeded=false exactly at the threshold (count === maxAttempts)', async () => {
    // inviteEmail has maxAttempts=1; count of 1 is allowed (strict >).
    expect(await tryInviteByEmailRateLimit(7n, 'a@b.c')).toEqual({ count: 1, exceeded: false })
    expect((await tryInviteByEmailRateLimit(7n, 'a@b.c')).exceeded).toBe(true)
  })

  it('applies the settings-driven windowSeconds to the window length', async () => {
    // resourceIp fixture windowSeconds is 60: a hit at t0 and t+59s
    // share a window; t+61s starts a fresh one.
    expect((await tryResourceRateLimit('10.0.0.1')).count).toBe(1)
    vi.setSystemTime(T0 + 59_000)
    expect((await tryResourceRateLimit('10.0.0.1')).count).toBe(2)
    vi.setSystemTime(T0 + 61_000)
    expect((await tryResourceRateLimit('10.0.0.1')).count).toBe(1)
  })
})
