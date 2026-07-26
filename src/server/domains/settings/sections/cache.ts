import { z } from 'zod'

import { FIXED_CACHE_PREFIXES } from '@/shared/cache/registry'
import { CACHE_BUCKET_FALLBACKS, type TunableCacheBucketId, TUNABLE_CACHE_BUCKET_IDS } from '@/shared/types/cache'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Per-bucket cache configuration (rows in the `kv_cache` table, tagged
// with the bucket id). Only tunable buckets own a settings slot — the
// slot list derives from the declaration registry
// (`@/shared/cache/registry`), and the editor can only rename the PREFIX
// and tune the TTL. The prefix has to end with `:` so the key shape
// stays namespaced and a prefix scan can never reach into a neighbouring
// bucket's namespace by accident (e.g. an `og` prefix could otherwise
// match `ogre-foo`).
//
// "RESERVED_PREFIXES" enumerates surfaces that the admin panel must
// NEVER let an editor overwrite — the session and rate-limit caches
// both depend on stable key shapes for safety reasons (clearing
// sessions logs everyone out; clearing rate-limit lets bad actors
// retry immediately). `avatar-status` is the historical two-key
// avatar layout — keeping it reserved means a future archeology dig
// can't be silently shadowed.
export const RESERVED_CACHE_PREFIXES: readonly string[] = ['session:', 'rate-limit:', 'avatar-status:']

const PREFIX_PATTERN = /^[a-z0-9_-]+:$/i
// 1 hour ≤ TTL ≤ 30 days. The lower bound keeps a typo from making a
// cache useless (sub-minute TTL would treadmill regenerations and
// hammer the database); the upper bound keeps stale renders from
// outliving a content rename for too long.
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

// Only tunable buckets get a settings slot; the non-tunable declarations
// (feed / sitemap / categories / tags / comments) keep their code TTL.
// TUNABLE_CACHE_BUCKET_IDS covers every tunable id by construction — the
// literal-keyed Record just can't be proven complete from a runtime map.
const tunableShape = unsafeCast<Record<TunableCacheBucketId, typeof cacheBucketSchema>>(
  Object.fromEntries(TUNABLE_CACHE_BUCKET_IDS.map((id) => [id, cacheBucketSchema])),
)

// The non-tunable default prefixes join the reserved set: renaming a
// tunable bucket onto one of them would merge two namespaces under one
// prefix and let a prefix scan reach across buckets.
const PROTECTED_PREFIXES: readonly string[] = [...RESERVED_CACHE_PREFIXES, ...FIXED_CACHE_PREFIXES]

export const cacheSchema = z
  .object({
    cache: z.object(tunableShape),
  })
  .superRefine((value, ctx) => {
    const buckets = value.cache
    const entries = TUNABLE_CACHE_BUCKET_IDS.map((id) => ({ id, prefix: buckets[id].prefix }))

    // Two prefixes "collide" if either is a strict prefix of the other.
    // Equality is the obvious case; the prefix-of case matters because a
    // prefix sweep `og-*` would match keys written under prefix `og-foo-`.
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

// Tunable cache slots derive from the declaration registry — only
// tunable buckets get a settings slot.
export const cacheDefaults = { cache: { ...CACHE_BUCKET_FALLBACKS } } as const

export const cacheSection = {
  scope: 'blog.cache',
  key: 'cache',
  schema: cacheSchema,
  defaults: cacheDefaults,
} as const
