import { createHash } from 'node:crypto'

import type { RateLimitBucket, RateLimitSettings } from '@/shared/config/types'

import { getLogger } from '@/server/infra/logger'
import { redisInstance } from '@/server/infra/redis/storage'
import { rateLimitDefaults } from '@/shared/config/defaults'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'

const log = getLogger('rate-limit')

// All keys live under the reserved `rate-limit:` namespace so the
// admin cache panel can never SCAN/UNLINK them by accident — see the
// `RESERVED_CACHE_PREFIXES` enforcement in `@/server/domains/settings/schema`.
const RATE_LIMIT_NAMESPACE = 'rate-limit:'

const signInKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}signin:${ip}`
const inviteKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}invite:${ip}`
const passwordResetKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}password-reset:${ip}`
const passwordResetTargetKey = (userId: bigint) => `${RATE_LIMIT_NAMESPACE}password-reset-target:${userId.toString()}`
const commentPostIpKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}comment-post:${ip}`

// Hash the email so the raw string never lands in Redis. SHA-256
// truncated to 32 hex chars (128 bits) is more than enough collision
// resistance for a per-window counter.
function hashEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  return createHash('sha256').update(normalized).digest('hex').slice(0, 32)
}

const commentPostEmailKey = (email: string) => `${RATE_LIMIT_NAMESPACE}comment-email:${hashEmail(email)}`
const inviteEmailKey = (adminId: bigint, email: string) =>
  `${RATE_LIMIT_NAMESPACE}invite-email:${adminId.toString()}:${hashEmail(email)}`
const passwordResetEmailKey = (email: string) => `${RATE_LIMIT_NAMESPACE}password-reset-email:${hashEmail(email)}`
const likeIncreaseKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}like-increase:${ip}`
const otpSendIpKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}otp-send:${ip}`
const otpSendEmailKey = (email: string) => `${RATE_LIMIT_NAMESPACE}otp-send-email:${hashEmail(email)}`
const otpVerifyIpKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}otp-verify:${ip}`
const otpVerifyEmailKey = (email: string) => `${RATE_LIMIT_NAMESPACE}otp-verify-email:${hashEmail(email)}`
const passkeyAuthBeginIpKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}passkey-auth-begin:${ip}`
const passkeyAuthFinishIpKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}passkey-auth-finish:${ip}`
const passkeyRegisterBeginIpKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}passkey-register-begin:${ip}`

// Conservative fallbacks used ONLY when the settings snapshot has
// not been hydrated yet (pre-install, or the very first request after
// boot if a hydration race ever lets a request slip past the install
// gate). The values are sourced from `rateLimitDefaults` in the
// section registry — the same payload the install flow seeds and the
// `loadSettingsFromDb` backfill writes for upgrading deployments — so
// the fallback path behaves identically to the seeded path.
const FALLBACK_RATE_LIMITS: RateLimitSettings = rateLimitDefaults

export function readBucket(name: keyof RateLimitSettings): RateLimitBucket {
  // We deliberately read the snapshot synchronously every call — the
  // in-process slot is a single-pointer load, so the cost is
  // negligible and an admin save takes effect on the very next
  // request without any TTL or restart.
  const bundle = getBlogSettingsBundleSync()
  const live = bundle?.rateLimit?.[name]
  if (live !== undefined) {
    return live
  }
  return FALLBACK_RATE_LIMITS[name]
}

export interface RateLimitResult {
  /** Post-increment counter value within the current window. */
  count: number
  /** True once the counter strictly exceeds the configured `maxAttempts`. */
  exceeded: boolean
}

// Increment-and-check in a single round trip. `INCR` is atomic in
// Redis so the post-increment counter is strictly monotonic; the
// pipelined `EXPIRE … NX` arms the TTL on the first hit only and
// silently no-ops on subsequent hits within the window (Redis 7.0+;
// older servers without NX support extend the TTL on every hit, which
// is still correct just less ideal).
export async function tryKeyedRateLimit(key: string, bucket: RateLimitBucket): Promise<RateLimitResult> {
  const redis = redisInstance()
  const pipeline = redis.pipeline()
  pipeline.incr(key)
  pipeline.expire(key, bucket.windowSeconds, 'NX')
  let results: [Error | null, unknown][] | null
  try {
    results = await pipeline.exec()
  } catch (err) {
    // Redis is unreachable (circuit open, network partition, OOM).
    // Fail closed — deny requests when the rate-limit counter is
    // unavailable to prevent brute-force attacks during degradation.
    log.warn('tryKeyedRateLimit: Redis pipeline failed, failing closed', {
      key,
      err: err instanceof Error ? err.message : String(err),
    })
    return { count: Number.POSITIVE_INFINITY, exceeded: true }
  }
  const incrResult = results?.[0]
  if (!incrResult || incrResult[0]) {
    log.warn('tryKeyedRateLimit: failed to increment counter, failing closed', {
      key,
      error: String(incrResult?.[0] ?? 'unknown redis error'),
    })
    return { count: Number.POSITIVE_INFINITY, exceeded: true }
  }
  const count = Number(incrResult[1])
  return { count, exceeded: count > bucket.maxAttempts }
}

/**
 * Throttles login attempts by client IP. Counts every reach of the
 * sign-in form (success and failure both bump the counter); the
 * threshold is "attempts per `windowSeconds`" and the bookkeeping
 * shouldn't depend on the eventual outcome of the login.
 */
export async function tryRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(signInKey(ip), readBucket('signInIp'))
}

/** Throttles admin author invitations by client IP. */
export async function tryInviteRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(inviteKey(ip), readBucket('inviteIp'))
}

/**
 * Throttles admin author invitations by `(actor adminId, invitee email)`.
 * Additive to {@link tryInviteRateLimit}: even if an admin's per-IP
 * budget is fresh, they cannot re-send invites to the same mailbox
 * faster than this bucket allows. The email is hashed before it lands
 * in Redis so the raw address never persists in the cache.
 */
export async function tryInviteByEmailRateLimit(adminId: bigint, email: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(inviteEmailKey(adminId, email), readBucket('inviteEmail'))
}

/** Throttles password-reset requests by client IP. */
export async function tryPasswordResetRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(passwordResetKey(ip), readBucket('passwordResetIp'))
}

/**
 * Throttles public lostpassword submissions by normalised target email.
 * Additive to {@link tryPasswordResetRateLimit}: stops an attacker
 * rotating client IPs from spamming reset prompts to a single mailbox.
 * The email is hashed before it lands in Redis.
 */
export async function tryPasswordResetByEmailRateLimit(email: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(passwordResetEmailKey(email), readBucket('passwordResetEmail'))
}

/**
 * Throttles admin-triggered password-reset emails by target user id.
 * Scoped per-target (not per-actor) so any admin — including a
 * compromised cookie — can't carpet-bomb a single mailbox even if
 * their own IP budget is fresh.
 */
export async function tryPasswordResetByTargetRateLimit(userId: bigint): Promise<RateLimitResult> {
  return tryKeyedRateLimit(passwordResetTargetKey(userId), readBucket('passwordResetTarget'))
}

/** Throttles public comment submissions by IP (independent of login rate limits). */
export async function tryCommentPostRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(commentPostIpKey(ip), readBucket('commentPostIp'))
}

/** Throttles public comment submissions by normalized email (spam from many IPs, one mailbox). */
export async function tryCommentPostRateLimitByEmail(email: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(commentPostEmailKey(email), readBucket('commentPostEmail'))
}

/**
 * Throttles `like` increases by client IP. Cancellation (the
 * token-driven decrease path) intentionally does NOT bump this
 * counter — only fresh inserts add `like` rows to the DB, so
 * gating insertion is the right shape to keep table growth
 * bounded. An admin who wants to relax the cap (e.g. a viral post)
 * can raise `maxAttempts` from `/admin/settings/rate-limit`
 * without touching cancel flows.
 */
export async function tryLikeIncreaseRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(likeIncreaseKey(ip), readBucket('likeIncreaseIp'))
}

const resourceKey = (ip: string) => `${RATE_LIMIT_NAMESPACE}resource:${ip}`

export async function tryResourceRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(resourceKey(ip), readBucket('resourceIp'))
}

export async function tryOtpSendRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(otpSendIpKey(ip), readBucket('otpSendIp'))
}

export async function tryOtpSendByEmailRateLimit(email: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(otpSendEmailKey(email), readBucket('otpSendEmail'))
}

export async function tryOtpVerifyRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(otpVerifyIpKey(ip), readBucket('otpVerifyIp'))
}

export async function tryOtpVerifyByEmailRateLimit(email: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(otpVerifyEmailKey(email), readBucket('otpVerifyEmail'))
}

const signInEmailKey = (email: string) => `${RATE_LIMIT_NAMESPACE}signin-email:${hashEmail(email)}`

export async function trySignInByEmailRateLimit(email: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(signInEmailKey(email), readBucket('signInEmail'))
}

export async function tryPasskeyAuthBeginRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(passkeyAuthBeginIpKey(ip), readBucket('passkeyAuthBeginIp'))
}

export async function tryPasskeyAuthFinishRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(passkeyAuthFinishIpKey(ip), readBucket('passkeyAuthFinishIp'))
}

export async function tryPasskeyRegisterBeginRateLimit(ip: string): Promise<RateLimitResult> {
  return tryKeyedRateLimit(passkeyRegisterBeginIpKey(ip), readBucket('passkeyRegisterBeginIp'))
}
