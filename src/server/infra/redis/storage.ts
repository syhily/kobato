/* oxlint-disable typescript/no-unsafe-type-assertion */
import type { Cluster, Redis } from 'ioredis'

import { Redis as RedisClient } from 'ioredis'
import superjson from 'superjson'

import { REDIS_KEY_PREFIX, REDIS_URL } from '@/server/infra/env'
import { registerShutdownHook } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('redis')

// ─── Circuit breaker ──────────────────────────────────────

const FAILURE_THRESHOLD = 5
const RESET_TIMEOUT_MS = 30_000

let consecutiveFailures = 0
let circuitOpenUntil = 0
let circuitOpen = false

function recordFailure(): void {
  consecutiveFailures++
  if (consecutiveFailures >= FAILURE_THRESHOLD && !circuitOpen) {
    circuitOpen = true
    circuitOpenUntil = Date.now() + RESET_TIMEOUT_MS
    log.warn('Redis circuit breaker opened', {
      failures: consecutiveFailures,
      resetIn: RESET_TIMEOUT_MS,
    })
  }
}

function recordSuccess(): void {
  consecutiveFailures = 0
  if (circuitOpen) {
    circuitOpen = false
    log.info('Redis circuit breaker closed')
  }
}

function isCircuitOpen(): boolean {
  if (!circuitOpen) {
    return false
  }
  if (Date.now() >= circuitOpenUntil) {
    circuitOpen = false
    log.info('Redis circuit breaker half-open, allowing probe')
    return false
  }
  return true
}

export function isRedisHealthy(): boolean {
  return !isCircuitOpen()
}

// ─── Client ───────────────────────────────────────────────

const redis = new RedisClient(REDIS_URL, {
  lazyConnect: true,
  keyPrefix: REDIS_KEY_PREFIX,
  commandTimeout: 10_000,
})

redis.on('error', (err) => {
  log.error('Redis connection error', { err: err.message })
  recordFailure()
})

redis.on('ready', () => {
  recordSuccess()
})

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
      return superjson.parse<T>(raw)
    } catch {
      return null
    }
  },

  async setItem(key: string, value: unknown, opts?: { ttl?: number }): Promise<void> {
    const payload = superjson.stringify(value)
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
        return { key, value: superjson.parse<T>(raw) }
      } catch {
        return { key, value: null }
      }
    })
  },

  /**
   * Unbounded SCAN over all Redis keys matching `prefix`. Prefer the
   * `scanKeys` async generator for large keyspaces to avoid blocking
   * the event loop. A `maxCount` guard aborts early and logs a warning
   * so runaway scans don't OOM the process.
   */
  async getKeys(prefix?: string, maxCount = 10_000): Promise<string[]> {
    const rawPattern = prefix ? `${prefix}*` : '*'
    // ioredis does NOT add keyPrefix to SCAN's MATCH argument, so we
    // prepend it manually. Returned keys include the prefix, so we strip
    // it before returning to keep the API consistent.
    const pattern = REDIS_KEY_PREFIX ? `${REDIS_KEY_PREFIX}${rawPattern}` : rawPattern
    const out: string[] = []
    let cursor = '0'
    do {
      const [nextCursor, batch] = (await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500)) as [string, string[]]
      cursor = nextCursor
      const prefix = REDIS_KEY_PREFIX
      const stripped = prefix ? batch.map((k) => (k.startsWith(prefix) ? k.slice(prefix.length) : k)) : batch
      out.push(...stripped)
      if (out.length > maxCount) {
        getLogger('redis.storage').warn('getKeys exceeded maxCount; scan aborted', {
          pattern,
          maxCount,
          returned: out.length,
        })
        break
      }
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

/** Ping Redis to verify connectivity (used by /ready probe). */
export async function pingRedis(): Promise<boolean> {
  try {
    const result = await redis.ping()
    if (result === 'PONG') {
      recordSuccess()
      return true
    }
    recordFailure()
    return false
  } catch {
    recordFailure()
    return false
  }
}

registerShutdownHook(closeRedis, 0)
