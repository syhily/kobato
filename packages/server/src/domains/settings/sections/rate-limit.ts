import { rateLimitBounds, rateLimitDefaults } from '@kobato/shared/config/defaults'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { z } from 'zod'

// Centralised rate-limiting policy. Every bucket maps 1:1 to a surface
// in `@kobato/server/infra/rate-limit`. The bounds live in
// `@kobato/shared/config/defaults` because the admin form mirrors them.
const rateLimitBucketSchema = z.object({
  windowSeconds: z.coerce.number().int().min(rateLimitBounds.windowSeconds.min).max(rateLimitBounds.windowSeconds.max),
  maxAttempts: z.coerce.number().int().min(rateLimitBounds.maxAttempts.min).max(rateLimitBounds.maxAttempts.max),
})

// `rateLimitDefaults` is the single source of truth for the bucket set
// (P1-26): the install seed, the settings backfill, and the infra
// limiter's fallback all read it. The key tuple is DERIVED so adding a
// bucket is a one-file edit; `Object.keys` widens to `string[]`, so
// narrow back to the concrete key set (the runtime value IS exactly the
// defaults' keys, in declaration order).
export const RATE_LIMIT_BUCKET_KEYS = unsafeCast<readonly (keyof typeof rateLimitDefaults)[]>(
  Object.keys(rateLimitDefaults),
)

// `Object.fromEntries` widens the shape's static type to an index
// signature; the runtime shape is exactly one bucket schema per
// RATE_LIMIT_BUCKET_KEYS entry, so narrow the type back to the concrete
// key set (runtime parse behavior is unchanged).
const rateLimitShape = unsafeCast<Record<(typeof RATE_LIMIT_BUCKET_KEYS)[number], typeof rateLimitBucketSchema>>(
  Object.fromEntries(RATE_LIMIT_BUCKET_KEYS.map((key) => [key, rateLimitBucketSchema])),
)

export const rateLimitSchema = z.object(rateLimitShape)

// The seed stays in `@kobato/shared/config/defaults` because the infra
// rate-limit fallback (`@kobato/server/infra/rate-limit`) shares it — this
// module only composes the section meta around it.
export const rateLimitSection = {
  scope: 'blog.rateLimit',
  key: 'rateLimit',
  schema: rateLimitSchema,
  defaults: rateLimitDefaults,
} as const
