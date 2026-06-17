import { beforeEach, describe, expect, it, vi } from 'vitest'

const pipelineMock = {
  incr: vi.fn(),
  expire: vi.fn(),
  exec: vi.fn(),
}

const redisMock = {
  pipeline: vi.fn(() => pipelineMock),
}

vi.mock('@/server/infra/redis/storage', () => ({
  redisInstance: vi.fn(() => redisMock),
}))

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
  type RateLimitResult,
} from '@/server/infra/rate-limit'

const sampleBucket = { windowSeconds: 60, maxAttempts: 3 }

describe('rate-limit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    bundle = null
    pipelineMock.exec.mockResolvedValue([[null, 1]])
  })

  it('readBucket prefers live settings and falls back to defaults', () => {
    bundle = { rateLimit: { signInIp: sampleBucket } }
    expect(readBucket('signInIp')).toBe(sampleBucket)

    bundle = { rateLimit: {} }
    expect(readBucket('signInIp')).toEqual(expect.objectContaining({ maxAttempts: 5 }))
  })

  it('tryKeyedRateLimit returns count and exceeded state on success', async () => {
    pipelineMock.exec.mockResolvedValue([[null, 4]])
    const result = await tryKeyedRateLimit('key:1', sampleBucket)
    expect(result.count).toBe(4)
    expect(result.exceeded).toBe(true)
    expect(pipelineMock.incr).toHaveBeenCalledWith('key:1')
    expect(pipelineMock.expire).toHaveBeenCalledWith('key:1', sampleBucket.windowSeconds, 'NX')
  })

  it('tryKeyedRateLimit fails closed when redis throws', async () => {
    pipelineMock.exec.mockRejectedValue(new Error('redis down'))
    const result = await tryKeyedRateLimit('key:2', sampleBucket)
    expect(result.exceeded).toBe(true)
    expect(result.count).toBe(Number.POSITIVE_INFINITY)
  })

  it('tryKeyedRateLimit fails closed when exec returns null', async () => {
    pipelineMock.exec.mockResolvedValue(null)
    const result = await tryKeyedRateLimit('key:3', sampleBucket)
    expect(result.exceeded).toBe(true)
  })

  it('tryKeyedRateLimit fails closed when incr reports an error', async () => {
    pipelineMock.exec.mockResolvedValue([[new Error('OOM'), 0]])
    const result = await tryKeyedRateLimit('key:4', sampleBucket)
    expect(result.exceeded).toBe(true)
  })

  it('covers every public rate-limit entry point', async () => {
    pipelineMock.exec.mockResolvedValue([[null, 1]])
    const callables: Array<() => Promise<RateLimitResult>> = [
      () => tryRateLimit('127.0.0.1'),
      () => tryInviteRateLimit('127.0.0.1'),
      () => tryInviteByEmailRateLimit(1n, 'a@example.com'),
      () => tryPasswordResetRateLimit('127.0.0.1'),
      () => tryPasswordResetByEmailRateLimit('a@example.com'),
      () => tryPasswordResetByTargetRateLimit(2n),
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
