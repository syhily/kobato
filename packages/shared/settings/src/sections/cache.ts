import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { FIXED_CACHE_PREFIXES } from '@kobato/cache/registry'
import { CACHE_BUCKET_FALLBACKS, type TunableCacheBucketId, TUNABLE_CACHE_BUCKET_IDS } from '@kobato/cache/types'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { z } from 'zod'

export const RESERVED_CACHE_PREFIXES: readonly string[] = ['session:', 'rate-limit:', 'avatar-status:']

export const cacheValidationMessages = {
  prefixFormat: 'admin.settings.cache.error.prefixFormat',
  prefixOverlap: 'admin.settings.cache.error.prefixOverlap',
  reservedPrefix: 'admin.settings.cache.error.reservedPrefix',
} as const satisfies Record<string, UiMessageId>

const PREFIX_PATTERN = /^[a-z0-9_-]+:$/i
const MIN_TTL_SECONDS = 60 * 60
const MAX_TTL_SECONDS = 60 * 60 * 24 * 30

const cacheBucketSchema = z.object({
  prefix: z.string().trim().min(2).max(40).regex(PREFIX_PATTERN, cacheValidationMessages.prefixFormat),
  ttlSeconds: z.coerce.number().int().min(MIN_TTL_SECONDS).max(MAX_TTL_SECONDS),
})

const tunableShape = unsafeCast<Record<TunableCacheBucketId, typeof cacheBucketSchema>>(
  Object.fromEntries(TUNABLE_CACHE_BUCKET_IDS.map((id) => [id, cacheBucketSchema])),
)

const PROTECTED_PREFIXES: readonly string[] = [...RESERVED_CACHE_PREFIXES, ...FIXED_CACHE_PREFIXES]

export const cacheSchema = z
  .object({
    cache: z.object(tunableShape),
  })
  .superRefine((value, ctx) => {
    const buckets = value.cache
    const entries = TUNABLE_CACHE_BUCKET_IDS.map((id) => ({ id, prefix: buckets[id].prefix }))

    function collides(a: string, b: string): boolean {
      return a === b || a.startsWith(b) || b.startsWith(a)
    }

    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const left = entries[i]
        const right = entries[j]
        if (left === undefined || right === undefined) {
          continue
        }
        if (collides(left.prefix, right.prefix)) {
          ctx.addIssue({
            code: 'custom',
            path: ['cache', right.id, 'prefix'],
            message: cacheValidationMessages.prefixOverlap,
            params: {
              right: right.id,
              rightPrefix: right.prefix,
              left: left.id,
              leftPrefix: left.prefix,
            },
          })
        }
      }

      const reserved = PROTECTED_PREFIXES.find((slot) => {
        const entry = entries[i]
        if (entry === undefined) {
          return false
        }
        return collides(entry.prefix, slot)
      })
      if (reserved !== undefined) {
        const entry = entries[i]
        if (entry !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['cache', entry.id, 'prefix'],
            message: cacheValidationMessages.reservedPrefix,
            params: { prefix: entry.prefix, reserved },
          })
        }
      }
    }
  })

export const cacheDefaults = { cache: { ...CACHE_BUCKET_FALLBACKS } } as const

export const cacheSection = {
  scope: 'blog.cache',
  key: 'cache',
  schema: cacheSchema,
  defaults: cacheDefaults,
} as const
