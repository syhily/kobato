import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import { rateLimitBucketSchema, upgradeLegacyRateLimitBuckets } from '@kobato/settings/rate-limit-bucket'
import { rateLimitDefaults } from '@kobato/settings/rate-limit-defaults'
import { z } from 'zod'

export const RATE_LIMIT_BUCKET_KEYS = unsafeCast<readonly (keyof typeof rateLimitDefaults)[]>(
  Object.keys(rateLimitDefaults),
)

const rateLimitShape = unsafeCast<Record<(typeof RATE_LIMIT_BUCKET_KEYS)[number], typeof rateLimitBucketSchema>>(
  Object.fromEntries(RATE_LIMIT_BUCKET_KEYS.map((key) => [key, rateLimitBucketSchema])),
)

export const rateLimitSchema = z.preprocess(upgradeLegacyRateLimitBuckets, z.object(rateLimitShape))

export const rateLimitSection = {
  scope: 'blog.rateLimit',
  key: 'rateLimit',
  schema: rateLimitSchema,
  defaults: rateLimitDefaults,
} as const
