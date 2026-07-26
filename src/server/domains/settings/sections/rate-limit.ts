import { z } from 'zod'

import { rateLimitDefaults } from '@/shared/config/defaults'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Centralised rate-limiting policy. Every bucket maps 1:1 to a surface
// in `@/server/infra/rate-limit`.
//
// Bounds: 60s ≤ window ≤ 24h (sub-minute windows treadmill the counter;
// >24h could lock a returning visitor out for a day over one typo), and
// 1 ≤ maxAttempts ≤ 1000 (0 would deny everyone; 1000 is a sanity
// ceiling).
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
  'signInEmail',
  'commentPostIp',
  'commentPostEmail',
  'likeIncreaseIp',
  'inviteIp',
  'inviteEmail',
  'passwordResetIp',
  'passwordResetEmail',
  'passwordResetTarget',
  'resourceIp',
  'otpSendIp',
  'otpSendEmail',
  'otpVerifyIp',
  'otpVerifyEmail',
  'passkeyAuthBeginIp',
  'passkeyAuthFinishIp',
  'passkeyRegisterBeginIp',
  'passkeyRegisterFinishIp',
  'passkeySetForceIp',
  'passkeyDeleteIp',
] as const

// `Object.fromEntries` widens the shape's static type to an index
// signature; the runtime shape is exactly one bucket schema per
// RATE_LIMIT_BUCKET_KEYS entry, so narrow the type back to the concrete
// key set (runtime parse behavior is unchanged).
const rateLimitShape = unsafeCast<Record<(typeof RATE_LIMIT_BUCKET_KEYS)[number], typeof rateLimitBucketSchema>>(
  Object.fromEntries(RATE_LIMIT_BUCKET_KEYS.map((key) => [key, rateLimitBucketSchema])),
)

export const rateLimitSchema = z.object(rateLimitShape)

/** Bounds re-exported so the admin form can mirror them in `min`/`max` attributes. */
export const RATE_LIMIT_BOUNDS = {
  windowSeconds: { min: RATE_LIMIT_MIN_WINDOW, max: RATE_LIMIT_MAX_WINDOW },
  maxAttempts: { min: RATE_LIMIT_MIN_ATTEMPTS, max: RATE_LIMIT_MAX_ATTEMPTS },
} as const

// The seed stays in `@/shared/config/defaults` because the infra
// rate-limit fallback (`@/server/infra/rate-limit`) shares it — this
// module only composes the section meta around it.
export const rateLimitSection = {
  scope: 'blog.rateLimit',
  key: 'rateLimit',
  schema: rateLimitSchema,
  defaults: rateLimitDefaults,
} as const
