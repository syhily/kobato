import { z } from 'zod'

import { rateLimitBounds, rateLimitDefaults } from '@/shared/config/defaults'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Centralised rate-limiting policy. Every bucket maps 1:1 to a surface
// in `@/server/infra/rate-limit`. The bounds live in
// `@/shared/config/defaults` because the admin form mirrors them.
const rateLimitBucketSchema = z.object({
  windowSeconds: z.coerce.number().int().min(rateLimitBounds.windowSeconds.min).max(rateLimitBounds.windowSeconds.max),
  maxAttempts: z.coerce.number().int().min(rateLimitBounds.maxAttempts.min).max(rateLimitBounds.maxAttempts.max),
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

// The seed stays in `@/shared/config/defaults` because the infra
// rate-limit fallback (`@/server/infra/rate-limit`) shares it — this
// module only composes the section meta around it.
export const rateLimitSection = {
  scope: 'blog.rateLimit',
  key: 'rateLimit',
  schema: rateLimitSchema,
  defaults: rateLimitDefaults,
} as const
