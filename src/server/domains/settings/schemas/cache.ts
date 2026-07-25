import { z } from 'zod'

import type { CacheBucketId } from '@/shared/types/cache'

// Per-bucket cache configuration (rows in the `kv_cache` table, tagged
// with the bucket id). Each bucket owns a stable id
// (`og` / `calendar` / `avatar`) baked into the writers; the editor can
// only rename the PREFIX and tune the TTL. The prefix has to end with
// `:` so the key shape stays namespaced and a prefix scan can never
// reach into a neighbouring bucket's namespace by accident (e.g. an
// `og` prefix could otherwise match `ogre-foo`).
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

export const cacheSchema = z
  .object({
    cache: z.object({
      og: cacheBucketSchema,
      calendar: cacheBucketSchema,
      avatar: cacheBucketSchema,
      // Image metadata lookups (storagePath → ImageRow) and comment
      // markdown render results both used to live in a process-local
      // `lru-cache`, which meant every server replica re-warmed the
      // same data and a deploy nuked them entirely. Routing them
      // through the shared `kv_cache` table like the other buckets
      // gives us shared warmth and one-click admin invalidation; the
      // writers still front the database round-trip with
      // `createInflight` so concurrent requests for the same key
      // collapse to a single load.
      imageMeta: cacheBucketSchema,
      embeddingSearch: cacheBucketSchema,
      searchResult: cacheBucketSchema,
    }),
  })
  .superRefine((value, ctx) => {
    const buckets = value.cache
    const entries: { id: CacheBucketId; prefix: string }[] = [
      { id: 'og', prefix: buckets.og.prefix },
      { id: 'calendar', prefix: buckets.calendar.prefix },
      { id: 'avatar', prefix: buckets.avatar.prefix },
      { id: 'imageMeta', prefix: buckets.imageMeta.prefix },
      { id: 'embeddingSearch', prefix: buckets.embeddingSearch.prefix },
      { id: 'searchResult', prefix: buckets.searchResult.prefix },
    ]

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

      const reserved = RESERVED_CACHE_PREFIXES.find((slot) => {
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
            message: `\`${entry.prefix}\` 与系统保留前缀 \`${reserved}\` 冲突（session / rate-limit 等不可被管理面板清空）`,
          })
        }
      }
    }
  })
