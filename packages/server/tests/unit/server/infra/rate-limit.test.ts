import { __clearLogCaptureForTests, __logCaptureForTests } from '@kobato/server/infra/logger.ts'
import {
  tryRateLimit,
  tryInviteRateLimit,
  tryInviteByEmailRateLimit,
  tryPasswordResetRateLimit,
  tryPasswordResetByEmailRateLimit,
  tryPasswordResetByTargetRateLimit,
  tryCommentPostRateLimit,
  tryCommentPostRateLimitByEmail,
  tryLikeIncreaseRateLimit,
  tryResourceRateLimit,
  tryOtpSendRateLimit,
  tryOtpSendByEmailRateLimit,
  tryOtpVerifyRateLimit,
  tryOtpVerifyByEmailRateLimit,
  trySignInByEmailRateLimit,
  tryPasskeyAuthBeginRateLimit,
  tryPasskeyAuthFinishRateLimit,
  tryPasskeyRegisterBeginRateLimit,
  tryPasskeyRegisterFinishRateLimit,
  tryPasskeySetForceRateLimit,
  tryPasskeyDeleteRateLimit,
  readBucket,
  tryKeyedRateLimit,
  rateLimitEntryCount,
  rateLimitIpKey,
  __resetRateLimitsForTests,
  type RateLimitResult,
} from '@kobato/server/infra/rate-limit.ts'
import { rateLimitDefaults } from '@kobato/settings/rate-limit-defaults.ts'
import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '@kobato/settings/tests/utils/blog-settings.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sampleBucket = { windowSeconds: 60, maxAttempts: 3 }
const T0 = new Date('2026-01-01T00:00:00.000Z').getTime()

describe('rate-limit', () => {
  beforeEach(() => {
    __clearLogCaptureForTests()
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    vi.clearAllMocks()
    __resetRateLimitsForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('readBucket prefers live settings and falls back to defaults', () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: { ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!, signIn: sampleBucket },
    })
    expect(readBucket('signIn')).toEqual(sampleBucket)

    setBlogSettingsBundleForTests(null)
    expect(readBucket('signIn')).toEqual(rateLimitDefaults.signIn)
  })

  it('counts post-increment within a window and trips strictly above maxAttempts', async () => {
    expect(await tryKeyedRateLimit('key:1', sampleBucket)).toEqual({ count: 1, exceeded: false })
    expect(await tryKeyedRateLimit('key:1', sampleBucket)).toEqual({ count: 2, exceeded: false })
    expect(await tryKeyedRateLimit('key:1', sampleBucket)).toEqual({ count: 3, exceeded: false })
    expect(await tryKeyedRateLimit('key:1', sampleBucket)).toEqual({ count: 4, exceeded: true })
  })

  it('anchors the window at the first hit and starts a new window after windowSeconds', async () => {
    await tryKeyedRateLimit('key:2', sampleBucket)
    vi.setSystemTime(T0 + 30_000)
    expect(await tryKeyedRateLimit('key:2', sampleBucket)).toEqual({ count: 2, exceeded: false })
    vi.setSystemTime(T0 + 59_999)
    expect(await tryKeyedRateLimit('key:2', sampleBucket)).toEqual({ count: 3, exceeded: false })
    vi.setSystemTime(T0 + 60_000)
    expect(await tryKeyedRateLimit('key:2', sampleBucket)).toEqual({ count: 1, exceeded: false })
  })

  it('tracks keys independently', async () => {
    await tryKeyedRateLimit('key:a', sampleBucket)
    await tryKeyedRateLimit('key:a', sampleBucket)
    expect(await tryKeyedRateLimit('key:b', sampleBucket)).toEqual({ count: 1, exceeded: false })
  })

  it('rateLimitEntryCount reports live entries and sweeps expired ones', async () => {
    expect(rateLimitEntryCount()).toBe(0)
    await tryKeyedRateLimit('key:1', sampleBucket)
    await tryKeyedRateLimit('key:2', sampleBucket)
    await tryKeyedRateLimit('key:2', sampleBucket)
    expect(rateLimitEntryCount()).toBe(2)

    vi.setSystemTime(T0 + 61_000)
    expect(rateLimitEntryCount()).toBe(0)
  })

  it('sweeps expired entries when the map is full instead of evicting live ones', async () => {
    const bucket = { windowSeconds: 60, maxAttempts: 1 }
    for (let i = 0; i < 10_000; i += 1) {
      await tryKeyedRateLimit(`spray:${i}`, bucket)
    }
    expect(rateLimitEntryCount()).toBe(10_000)

    vi.setSystemTime(T0 + 61_000)
    await tryKeyedRateLimit('spray:new', bucket)
    expect(rateLimitEntryCount()).toBe(1)
    expect(__logCaptureForTests().some((e) => e.level === 'warn')).toBe(false)
  })

  it('evicts the oldest windows and warns when the map is full of live entries', async () => {
    const bucket = { windowSeconds: 60, maxAttempts: 100 }
    for (let i = 0; i < 10_000; i += 1) {
      await tryKeyedRateLimit(`spray:${i}`, bucket)
    }
    await tryKeyedRateLimit('spray:overflow', bucket)
    expect(rateLimitEntryCount()).toBe(10_000)
    expect(__logCaptureForTests().filter((e) => e.level === 'warn')).toHaveLength(1)
    expect(await tryKeyedRateLimit('spray:overflow', bucket)).toEqual({ count: 2, exceeded: false })
    expect(await tryKeyedRateLimit('spray:0', bucket)).toEqual({ count: 1, exceeded: false })
  })

  it('covers every public rate-limit entry point', async () => {
    const callables: Array<() => Promise<RateLimitResult>> = [
      () => tryRateLimit('127.0.0.1'),
      () => tryInviteRateLimit('127.0.0.1'),
      () => tryInviteByEmailRateLimit(1, 'a@example.com'),
      () => tryPasswordResetRateLimit('127.0.0.1'),
      () => tryPasswordResetByEmailRateLimit('a@example.com'),
      () => tryPasswordResetByTargetRateLimit(2),
      () => tryCommentPostRateLimit('127.0.0.1'),
      () => tryCommentPostRateLimitByEmail('a@example.com'),
      () => tryLikeIncreaseRateLimit('127.0.0.1'),
      () => tryResourceRateLimit('127.0.0.1'),
      () => tryOtpSendRateLimit('127.0.0.1'),
      () => tryOtpSendByEmailRateLimit('a@example.com'),
      () => tryOtpVerifyRateLimit('127.0.0.1'),
      () => tryOtpVerifyByEmailRateLimit('a@example.com'),
      () => trySignInByEmailRateLimit('a@example.com'),
      () => tryPasskeyAuthBeginRateLimit('127.0.0.1'),
      () => tryPasskeyAuthFinishRateLimit('127.0.0.1'),
      () => tryPasskeyRegisterBeginRateLimit('127.0.0.1'),
      () => tryPasskeyRegisterFinishRateLimit('127.0.0.1'),
      () => tryPasskeySetForceRateLimit('127.0.0.1'),
      () => tryPasskeyDeleteRateLimit('127.0.0.1'),
    ]

    for (const callable of callables) {
      const res = await callable()
      expect(res.exceeded).toBe(false)
    }
  })
})

describe('rate-limit — rateLimitIpKey (IPv6 /64 grouping)', () => {
  it('keeps IPv4 keys verbatim', () => {
    expect(rateLimitIpKey('203.0.113.10')).toBe('203.0.113.10')
  })

  it('groups addresses inside one /64 into a single key', () => {
    expect(rateLimitIpKey('2001:db8:abcd:1234::1')).toBe('2001:db8:abcd:1234::/64')
    expect(rateLimitIpKey('2001:db8:abcd:1234:ffff:ffff:ffff:ffff')).toBe('2001:db8:abcd:1234::/64')
    expect(rateLimitIpKey('2001:db8:abcd:1235::1')).not.toBe('2001:db8:abcd:1234::/64')
  })

  it('expands :: and zero-pads missing hextets before grouping', () => {
    expect(rateLimitIpKey('2001:db8::1')).toBe('2001:db8:0:0::/64')
    expect(rateLimitIpKey('::1')).toBe('0:0:0:0::/64')
  })

  it('normalizes IPv4-mapped v6 addresses to the embedded v4 key', () => {
    expect(rateLimitIpKey('::ffff:203.0.113.10')).toBe('203.0.113.10')
  })

  it('shares one counter across a whole /64 (the grouped key trips, not the address)', async () => {
    expect(await tryResourceRateLimit('2001:db8:dead:beef::1')).toEqual(expect.objectContaining({ count: 1 }))
    expect(await tryResourceRateLimit('2001:db8:dead:beef::2')).toEqual(expect.objectContaining({ count: 2 }))
  })
})
