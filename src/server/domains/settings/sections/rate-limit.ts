import { z } from 'zod'

import { rateLimitDefaults } from '@/shared/config/defaults'
import { rateLimitBucketSchema, upgradeLegacyRateLimitBuckets } from '@/shared/config/rate-limit-bucket'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Centralised rate-limiting policy; buckets map to the counter dimensions in
// `@/server/infra/rate-limit`, and the bounds live in
// `@/shared/config/defaults` (mirrored by the admin form).

// `rateLimitDefaults` is the single source of truth for the bucket set; the keys
// are DERIVED and narrowed back to the concrete key set (the runtime value IS the
// defaults' keys, in declaration order).
export const RATE_LIMIT_BUCKET_KEYS = unsafeCast<readonly (keyof typeof rateLimitDefaults)[]>(
  Object.keys(rateLimitDefaults),
)

// Narrow the widened index-signature type back to the concrete key set
// (runtime parse behavior is unchanged).
const rateLimitShape = unsafeCast<Record<(typeof RATE_LIMIT_BUCKET_KEYS)[number], typeof rateLimitBucketSchema>>(
  Object.fromEntries(RATE_LIMIT_BUCKET_KEYS.map((key) => [key, rateLimitBucketSchema])),
)

// Rows stored before the per-dimension twins merged still carry the legacy
// keys; upgrade them on parse so the next save persists the current shape.
export const rateLimitSchema = z.preprocess(upgradeLegacyRateLimitBuckets, z.object(rateLimitShape))

// Seed shared with the infra rate-limit fallback; this module only composes the section meta.
export const rateLimitSection = {
  scope: 'blog.rateLimit',
  key: 'rateLimit',
  schema: rateLimitSchema,
  defaults: rateLimitDefaults,
} as const
