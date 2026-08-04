import type { RateLimitSettings } from '@kobato/shared/config/types'
import type { Assert, Equals } from '@kobato/shared/contracts/primitives'

// Bounds shared by the server section schema and the admin form's
// min/max attributes: 60s ≤ window ≤ 24h (sub-minute windows treadmill
// the counter; >24h could lock a returning visitor out for a day over
// one typo), and 1 ≤ maxAttempts ≤ 1000 (0 would deny everyone; 1000 is
// a sanity ceiling).
export const rateLimitBounds = {
  windowSeconds: { min: 60, max: 60 * 60 * 24 },
  maxAttempts: { min: 1, max: 1000 },
} as const

// Conservative rate-limit defaults used by the install seed, the
// settings backfill, and the infra rate-limit fallback path.
export const rateLimitDefaults = {
  signInIp: { windowSeconds: 60 * 30, maxAttempts: 5 },
  commentPostIp: { windowSeconds: 60 * 60, maxAttempts: 12 },
  commentPostEmail: { windowSeconds: 60 * 60, maxAttempts: 8 },
  likeIncreaseIp: { windowSeconds: 60 * 60, maxAttempts: 30 },
  inviteIp: { windowSeconds: 60 * 60, maxAttempts: 5 },
  inviteEmail: { windowSeconds: 60 * 60, maxAttempts: 1 },
  passwordResetIp: { windowSeconds: 60 * 30, maxAttempts: 3 },
  passwordResetEmail: { windowSeconds: 60 * 5, maxAttempts: 1 },
  passwordResetTarget: { windowSeconds: 60, maxAttempts: 1 },
  resourceIp: { windowSeconds: 60, maxAttempts: 60 },
  otpSendIp: { windowSeconds: 60 * 5, maxAttempts: 3 },
  otpSendEmail: { windowSeconds: 60 * 5, maxAttempts: 1 },
  otpVerifyIp: { windowSeconds: 60 * 5, maxAttempts: 5 },
  otpVerifyEmail: { windowSeconds: 60 * 5, maxAttempts: 5 },
  signInEmail: { windowSeconds: 60 * 30, maxAttempts: 5 },
  passkeyAuthBeginIp: { windowSeconds: 60 * 5, maxAttempts: 10 },
  passkeyAuthFinishIp: { windowSeconds: 60 * 5, maxAttempts: 10 },
  passkeyRegisterBeginIp: { windowSeconds: 60 * 5, maxAttempts: 10 },
  passkeyRegisterFinishIp: { windowSeconds: 60 * 5, maxAttempts: 10 },
  passkeySetForceIp: { windowSeconds: 60 * 5, maxAttempts: 10 },
  passkeyDeleteIp: { windowSeconds: 60 * 5, maxAttempts: 10 },
} as const

// Compile-time half of the bucket parity contract (P1-26): the
// `RateLimitSettings` interface has no runtime presence, so its key set
// is pinned to the defaults here — adding a bucket to the interface (or
// the infra limiter, which is type-bound to it) without a defaults entry
// fails the typecheck instead of drifting into a NaN-window fallback.
// The runtime half lives in `tests/unit/shared/contracts/
// rate-limit-buckets.test.ts`.
type _rateLimitDefaultsKeyParity = Assert<Equals<keyof typeof rateLimitDefaults, keyof RateLimitSettings>>
