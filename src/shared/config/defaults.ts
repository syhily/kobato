import type { RateLimitSettings } from '@/shared/config/types'
import type { Assert, Equals } from '@/shared/contracts/primitives'

// Bounds shared by the server section schema and the admin form's
// min/max attributes: 60s ≤ window ≤ 24h, 1 ≤ maxAttempts ≤ 1000.
export const rateLimitBounds = {
  windowSeconds: { min: 60, max: 60 * 60 * 24 },
  maxAttempts: { min: 1, max: 1000 },
} as const

// Conservative rate-limit defaults used by the install seed, the settings
// backfill and the infra rate-limit fallback path.
export const rateLimitDefaults = {
  signIn: { windowSeconds: 60 * 30, maxAttempts: 5 },
  otpSend: { windowSeconds: 60 * 5, maxAttempts: 3 },
  otpVerify: { windowSeconds: 60 * 5, maxAttempts: 5 },
  passwordReset: { windowSeconds: 60 * 30, maxAttempts: 3 },
  passwordResetTarget: { windowSeconds: 60, maxAttempts: 1 },
  comment: { windowSeconds: 60 * 60, maxAttempts: 12 },
  like: { windowSeconds: 60 * 60, maxAttempts: 30 },
  invite: { windowSeconds: 60 * 60, maxAttempts: 3 },
  resource: { windowSeconds: 60, maxAttempts: 60 },
  passkeyAuth: { windowSeconds: 60 * 5, maxAttempts: 10 },
  passkeyManage: { windowSeconds: 60 * 5, maxAttempts: 10 },
} as const

// Compile-time half of the bucket parity contract: the key set of
// `RateLimitSettings` is pinned to these defaults, so adding a bucket without a
// defaults entry fails the typecheck. The runtime half lives in
// `tests/unit/shared/contracts/rate-limit-buckets.test.ts`.
type _rateLimitDefaultsKeyParity = Assert<Equals<keyof typeof rateLimitDefaults, keyof RateLimitSettings>>
