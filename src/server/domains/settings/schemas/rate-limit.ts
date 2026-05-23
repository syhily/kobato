import { z } from 'zod'

// Centralised rate-limiting policy. Every bucket below maps 1:1 to a
// surface in `@/server/infra/rate-limit`:
//
//   * `signInIp`            — `tryRateLimit(ip)` (login form)
//   * `commentPostIp`       — `tryCommentPostRateLimit(ip)` (anonymous comments)
//   * `commentPostEmail`    — `tryCommentPostRateLimitByEmail(email)`
//   * `likeIncreaseIp`      — `tryLikeIncreaseRateLimit(ip)` (post likes)
//   * `inviteIp`            — `tryInviteRateLimit(ip)` (admin invite)
//   * `inviteEmail`         — `tryInviteByEmailRateLimit(adminId, email)`
//   * `passwordResetIp`     — `tryPasswordResetRateLimit(ip)` (lostpassword)
//   * `passwordResetEmail`  — `tryPasswordResetByEmailRateLimit(email)`
//   * `passwordResetTarget` — `tryPasswordResetByTargetRateLimit(userId)`
//   * `resourceIp`          — `tryResourceRateLimit(ip)` (resource downloads)
//
// Bounds rationale:
//
//   * 60s ≤ window ≤ 24h. Sub-minute windows treadmill the counter
//     (the EXPIRE NX wouldn't even land before the TTL ticks); >24h
//     would let one typo lock a returning visitor out for an entire
//     day. The historical hard-coded values (30 min sign-in, 1 h
//     comment IP/email) sit comfortably inside this band.
//   * 1 ≤ maxAttempts ≤ 1000. The lower bound prevents the "0 means
//     deny everyone" footgun; the upper bound is a sanity ceiling
//     (a logged-in visitor clicking "like" once per second for
//     ~16 minutes would still come in under it).
const RATE_LIMIT_MIN_WINDOW = 60
const RATE_LIMIT_MAX_WINDOW = 60 * 60 * 24
const RATE_LIMIT_MIN_ATTEMPTS = 1
const RATE_LIMIT_MAX_ATTEMPTS = 1000

const rateLimitBucketSchema = z.object({
  windowSeconds: z.coerce.number().int().min(RATE_LIMIT_MIN_WINDOW).max(RATE_LIMIT_MAX_WINDOW),
  maxAttempts: z.coerce.number().int().min(RATE_LIMIT_MIN_ATTEMPTS).max(RATE_LIMIT_MAX_ATTEMPTS),
})

export const RATE_LIMIT_BUCKET_KEYS = [
  'signInIp',
  'commentPostIp',
  'commentPostEmail',
  'likeIncreaseIp',
  'inviteIp',
  'inviteEmail',
  'passwordResetIp',
  'passwordResetEmail',
  'passwordResetTarget',
  'resourceIp',
] as const

export const rateLimitSchema = z.object(
  Object.fromEntries(RATE_LIMIT_BUCKET_KEYS.map((key) => [key, rateLimitBucketSchema])),
)
export type RateLimitInput = z.infer<typeof rateLimitSchema>

/** Bounds re-exported so the admin form can mirror them in `min`/`max` attributes. */
export const RATE_LIMIT_BOUNDS = {
  windowSeconds: { min: RATE_LIMIT_MIN_WINDOW, max: RATE_LIMIT_MAX_WINDOW },
  maxAttempts: { min: RATE_LIMIT_MIN_ATTEMPTS, max: RATE_LIMIT_MAX_ATTEMPTS },
} as const
