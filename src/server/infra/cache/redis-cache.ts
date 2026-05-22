import type { ZodType } from 'zod'

import superjson from 'superjson'

import { redisInstance } from '@/server/infra/redis/storage'

export interface RedisCacheOptions<T> {
  ttlMs: number
  /** Optional Zod schema for forward-compatible deserialization.
   *  When provided, `get()` validates cached data against the schema so
   *  stale entries missing newly-added fields are treated as a cache miss
   *  instead of causing runtime errors. */
  schema?: ZodType<T>
}

export function createRedisCache<T>(key: string, options: RedisCacheOptions<T>) {
  const ttlSeconds = Math.max(1, Math.ceil(options.ttlMs / 1000))

  async function get(): Promise<T | null> {
    const raw = await redisInstance().get(key)
    if (raw === null) {
      return null
    }
    try {
      const parsed = superjson.parse<T>(raw)
      if (options.schema) {
        const result = options.schema.safeParse(parsed)
        if (!result.success) {
          // Schema mismatch (e.g. new field added) — evict and treat as miss
          await redisInstance().del(key)
          return null
        }
        return result.data
      }
      return parsed
    } catch {
      // corrupted entry — evict and treat as miss
      await redisInstance().del(key)
      return null
    }
  }

  async function set(value: T): Promise<void> {
    await redisInstance().set(key, superjson.stringify(value), 'EX', ttlSeconds)
  }

  async function clear(): Promise<void> {
    await redisInstance().del(key)
  }

  return { get, set, clear }
}
