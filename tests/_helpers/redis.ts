import { REDIS_KEY_PREFIX } from '@/server/infra/env'
import { redisInstance } from '@/server/infra/redis/storage'

/**
 * Delete every key that belongs to the current worker's Redis prefix.
 *
 * Used in place of `FLUSHDB` so that parallel Vitest workers (which all
 * share DB 0 but use distinct `REDIS_KEY_PREFIX` values) never wipe each
 * other's test state.
 */
export async function flushWorkerRedis(): Promise<void> {
  const redis = redisInstance()
  const prefix = REDIS_KEY_PREFIX ?? ''
  // ioredis does NOT add keyPrefix to SCAN's MATCH argument, and it does
  // NOT strip the prefix from returned keys. So we build the raw pattern
  // ourselves and strip the prefix before calling del (otherwise ioredis
  // would double-prefix the key).
  const pattern = prefix ? `${prefix}*` : '*'
  let cursor = '0'
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500)
    cursor = nextCursor
    if (keys.length > 0) {
      const stripped = prefix ? keys.map((k) => (k.startsWith(prefix) ? k.slice(prefix.length) : k)) : keys
      await redis.del(...stripped)
    }
  } while (cursor !== '0')
}
