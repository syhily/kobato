import { beforeEach, describe, expect, it } from 'vitest'

import { recordSessionLogin } from '@/server/domains/auth/repo'
import { listSessionsByUser } from '@/server/domains/auth/service'
import { redisInstance } from '@/server/infra/redis/storage'

const mockDb = {} as any

async function clearSessionKeys(): Promise<void> {
  const redis = redisInstance()
  let cursor = '0'
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'user_sessions:*', 'COUNT', 100)
    cursor = nextCursor
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  } while (cursor !== '0')

  cursor = '0'
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'session:*', 'COUNT', 100)
    cursor = nextCursor
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  } while (cursor !== '0')

  cursor = '0'
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'session_meta:*', 'COUNT', 100)
    cursor = nextCursor
    if (keys.length > 0) {
      await redis.del(...keys)
    }
  } while (cursor !== '0')
}

beforeEach(async () => {
  await clearSessionKeys()
})

describe('listSessionsByUser', () => {
  it('joins the user_sessions set with each session_meta hash and returns parsed metadata', async () => {
    const userId = 42n
    const loginAt = new Date('2026-05-01T08:00:00Z')
    const redis = redisInstance()

    // `recordSessionLogin` writes the meta hash; the `user_sessions` set
    // is populated by `establishLoginSession` in production. We mirror that
    // step manually so `listSessionsByUser` sees the sids.
    await redis.sadd(`user_sessions:${userId}`, 'sid-a')
    await redis.set(`session:sid-a`, 'blob-a')
    await recordSessionLogin({
      sid: 'sid-a',
      userId,
      userAgent: 'Mozilla/5.0 (Macintosh) Chrome/120',
      ip: '203.0.113.1',
      loginAt,
    })
    await redis.sadd(`user_sessions:${userId}`, 'sid-b')
    await redis.set(`session:sid-b`, 'blob-b')
    await recordSessionLogin({
      sid: 'sid-b',
      userId,
      userAgent: null,
      ip: '203.0.113.2',
      loginAt,
    })

    const sessions = await listSessionsByUser(mockDb, userId)
    const ids = sessions.map((s) => s.sid).sort()
    expect(ids).toEqual(['sid-a', 'sid-b'])

    const first = sessions.find((s) => s.sid === 'sid-a')
    expect(first?.userId).toBe(userId)
    expect(first?.userAgent).toContain('Chrome')
    expect(first?.ip).toBe('203.0.113.1')
    expect(first?.loginAt.getTime()).toBe(loginAt.getTime())
    expect(first?.lastActiveAt.getTime()).toBe(loginAt.getTime())
    expect(first?.expiresAt.getTime()).toBeGreaterThan(loginAt.getTime())
  })

  it('returns empty when no sessions are registered', async () => {
    const sessions = await listSessionsByUser(mockDb, 7n)
    expect(sessions).toEqual([])
  })
})
