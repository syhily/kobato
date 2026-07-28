import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loggerMocks = vi.hoisted(() => ({
  warn: vi.fn(),
}))

vi.mock('@/server/infra/logger', () => ({
  getLogger: vi.fn(() => ({
    warn: loggerMocks.warn,
    info: vi.fn(),
    error: vi.fn(),
    child: vi.fn(function (this: unknown) {
      return this
    }),
  })),
}))

let bundle: Record<string, unknown> | null = null
vi.mock('@/shared/config/getters', () => ({
  getBlogSettingsBundleSync: vi.fn(() => bundle),
}))

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
  __resetRateLimitsForTests,
  type RateLimitResult,
} from '@/server/infra/rate-limit'

const sampleBucket = { windowSeconds: 60, maxAttempts: 3 }
const T0 = new Date('2026-01-01T00:00:00.000Z').getTime()

describe('rate-limit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    vi.clearAllMocks()
    bundle = null
    __resetRateLimitsForTests()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('readBucket prefers live settings and falls back to defaults', () => {
    bundle = { rateLimit: { signInIp: sampleBucket } }
    expect(readBucket('signInIp')).toBe(sampleBucket)

    bundle = { rateLimit: {} }
    expect(readBucket('signInIp')).toEqual(expect.objectContaining({ maxAttempts: 5 }))
  })

  it('counts post-increment within a window and trips strictly above maxAttempts', async () => {
    // windowSeconds: 60, maxAttempts: 3 → hits 1–3 allowed, 4th trips.
    expect(await tryKeyedRateLimit('key:1', sampleBucket)).toEqual({ count: 1, exceeded: false })
    expect(await tryKeyedRateLimit('key:1', sampleBucket)).toEqual({ count: 2, exceeded: false })
    expect(await tryKeyedRateLimit('key:1', sampleBucket)).toEqual({ count: 3, exceeded: false })
    expect(await tryKeyedRateLimit('key:1', sampleBucket)).toEqual({ count: 4, exceeded: true })
  })

  it('anchors the window at the first hit and starts a new window after windowSeconds', async () => {
    await tryKeyedRateLimit('key:2', sampleBucket)
    // 30s in: same window, the counter keeps climbing.
    vi.setSystemTime(T0 + 30_000)
    expect(await tryKeyedRateLimit('key:2', sampleBucket)).toEqual({ count: 2, exceeded: false })
    vi.setSystemTime(T0 + 59_999)
    expect(await tryKeyedRateLimit('key:2', sampleBucket)).toEqual({ count: 3, exceeded: false })
    // 60s after the FIRST hit (not the last one): new window, counter resets.
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

    // Every entry has expired; the next insert must reclaim them
    // without touching the eviction path.
    vi.setSystemTime(T0 + 61_000)
    await tryKeyedRateLimit('spray:new', bucket)
    expect(rateLimitEntryCount()).toBe(1)
    expect(loggerMocks.warn).not.toHaveBeenCalled()
  })

  it('evicts the oldest windows and warns when the map is full of live entries', async () => {
    const bucket = { windowSeconds: 60, maxAttempts: 100 }
    for (let i = 0; i < 10_000; i += 1) {
      await tryKeyedRateLimit(`spray:${i}`, bucket)
    }
    // One more distinct key while every entry is still live → capacity
    // guard evicts the oldest window (`spray:0`, stable order on equal
    // resetAt) to make room.
    await tryKeyedRateLimit('spray:overflow', bucket)
    expect(rateLimitEntryCount()).toBe(10_000)
    expect(loggerMocks.warn).toHaveBeenCalledTimes(1)
    // The overflow key is tracked; the evicted key restarts at count 1.
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
