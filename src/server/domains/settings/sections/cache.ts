import { z } from 'zod'

import { FIXED_CACHE_PREFIXES } from '@/shared/cache/registry'
import { CACHE_BUCKET_FALLBACKS, type TunableCacheBucketId, TUNABLE_CACHE_BUCKET_IDS } from '@/shared/types/cache'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Per-bucket cache configuration: only tunable buckets own a settings slot (derived
// from `@/shared/cache/registry`), and the prefix must end with `:` so a prefix scan
// can never reach into a neighbouring bucket. RESERVED_CACHE_PREFIXES must NEVER be
// editor-overwritable — session/rate-limit caches depend on stable key shapes.
export const RESERVED_CACHE_PREFIXES: readonly string[] = ['session:', 'rate-limit:', 'avatar-status:']

const PREFIX_PATTERN = /^[a-z0-9_-]+:$/i
// 1 hour ≤ TTL ≤ 30 days — below 1h a typo would treadmill regenerations;
// above 30d stale renders outlive content renames.
const MIN_TTL_SECONDS = 60 * 60
const MAX_TTL_SECONDS = 60 * 60 * 24 * 30

const cacheBucketSchema = z.object({
  prefix: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(PREFIX_PATTERN, '前缀只能包含字母 / 数字 / `_` / `-`，且必须以 `:` 结尾'),
  ttlSeconds: z.coerce.number().int().min(MIN_TTL_SECONDS).max(MAX_TTL_SECONDS),
})

// Non-tunable buckets keep their code TTL; the literal-keyed Record can't be
// proven complete from a runtime map.
const tunableShape = unsafeCast<Record<TunableCacheBucketId, typeof cacheBucketSchema>>(
  Object.fromEntries(TUNABLE_CACHE_BUCKET_IDS.map((id) => [id, cacheBucketSchema])),
)

// Non-tunable default prefixes are protected too — renaming a tunable bucket onto one would merge namespaces.
const PROTECTED_PREFIXES: readonly string[] = [...RESERVED_CACHE_PREFIXES, ...FIXED_CACHE_PREFIXES]

export const cacheSchema = z
  .object({
    cache: z.object(tunableShape),
  })
  .superRefine((value, ctx) => {
    const buckets = value.cache
    const entries = TUNABLE_CACHE_BUCKET_IDS.map((id) => ({ id, prefix: buckets[id].prefix }))

    // "Collide" = either prefix is a strict prefix of the other — a sweep under one would match the other's keys.
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
            message: `「${right.id}」的前缀 \`${right.prefix}\` 与「${left.id}」的前缀 \`${left.prefix}\` 冲突，会让前缀扫描互相误伤`,
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
            message: `\`${entry.prefix}\` 与系统保留前缀 \`${reserved}\` 冲突（session / rate-limit / 固定缓存不可被管理面板清空）`,
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
