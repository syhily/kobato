import type { Cluster, Redis } from 'ioredis'

import { Redis as RedisClient } from 'ioredis'

import { REDIS_URL } from '@/server/infra/env'
import { registerShutdownHook } from '@/server/infra/shutdown'

const redis = new RedisClient(REDIS_URL)

/**
 * Lightweight Redis cache helper backed by the native ioredis client.
 *
 * Replaces the previous unstorage wrapper so we can drop that dependency
 * while keeping the calling surface unchanged.
 */
export const storage = {
  async getItem<T>(key: string): Promise<T | null> {
    const raw = await redis.get(key)
    if (raw === null) {
      return null
    }
    try {
      return JSON.parse(raw) as T
    } catch {
      return raw as T
    }
  },

  async setItem(key: string, value: unknown, opts?: { ttl?: number }): Promise<void> {
    const payload = JSON.stringify(value)
    if (opts?.ttl) {
      await redis.set(key, payload, 'EX', opts.ttl)
    } else {
      await redis.set(key, payload)
    }
  },

  async getItemRaw<T>(key: string): Promise<T | null> {
    const raw = await redis.getBuffer(key)
    if (raw === null) {
      return null
    }
    return raw as T
  },

  async setItemRaw(key: string, value: unknown, opts?: { ttl?: number }): Promise<void> {
    if (opts?.ttl) {
      await redis.set(key, value as string | Buffer, 'EX', opts.ttl)
    } else {
      await redis.set(key, value as string | Buffer)
    }
  },

  async removeItem(key: string): Promise<void> {
    await redis.del(key)
  },

  async getItems<T>(keys: string[]): Promise<{ key: string; value: T | null }[]> {
    if (keys.length === 0) {
      return []
    }
    const values = await redis.mget(...keys)
    return keys.map((key, i) => {
      const raw = values[i]
      if (raw === null) {
        return { key, value: null }
      }
      try {
        return { key, value: JSON.parse(raw) as T }
      } catch {
        return { key, value: raw as T }
      }
    })
  },

  async getKeys(prefix?: string): Promise<string[]> {
    const pattern = prefix ? `${prefix}*` : '*'
    const out: string[] = []
    let cursor = '0'
    do {
      const [nextCursor, batch] = (await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500)) as [string, string[]]
      cursor = nextCursor
      out.push(...batch)
    } while (cursor !== '0')
    return out
  },
}

/**
 * Expose the underlying ioredis client for callers that need atomic
 * operations (INCR, EXPIRE, MULTI, SCAN, …) that the high-level `storage`
 * interface intentionally doesn't expose.
 *
 * Used by `rate-limit.server.ts` to avoid a read-modify-write race on the
 * counter, and by `session-storage.ts` for pipeline-based session eviction.
 */
export function redisInstance(): Redis | Cluster {
  return redis
}

export async function closeRedis(): Promise<void> {
  await redis.quit()
}

registerShutdownHook(closeRedis)
