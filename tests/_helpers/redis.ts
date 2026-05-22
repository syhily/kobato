import { redisInstance } from '@/server/infra/redis/storage'

/**
 * Delete every key that belongs to the current worker's Redis prefix.
 *
 * Used in place of `FLUSHDB` so that parallel Vitest workers (which may
 * share the same Redis DB number when there are more than 16 workers)
 * never wipe each other's test state.
 */
export async function flushWorkerRedis(): Promise<void> {
  const redis = redisInstance()
  let cursor = '0'
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', '*', 'COUNT', 500)
    cursor = nextCursor
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  } while (cursor !== '0')
}
