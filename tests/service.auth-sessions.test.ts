import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

// In-memory stand-in for the subset of Redis the session-meta module
// uses. Only sadd/smembers/hgetall/hset/del are exercised here, which
// keeps the harness narrow enough to assert against without dragging
// in the full mock from `tests/_helpers/redis.ts`.
const userSets = new Map<string, Set<string>>()
const metaHashes = new Map<string, Record<string, string>>()
// Mirror the cookie blob namespace (`session:<sid>`) so the
// EXISTS-based liveness check in `listSessionsByUser` /
// `listAllSessions` sees a realistic Redis state.
const sessionBlobs = new Set<string>()

const redisStub = {
  sadd: vi.fn(async (key: string, value: string) => {
    const set = userSets.get(key) ?? new Set<string>()
    set.add(value)
    userSets.set(key, set)
    return 1
  }),
  smembers: vi.fn(async (key: string) => {
    return Array.from(userSets.get(key) ?? [])
  }),
  hset: vi.fn(async (key: string, fields: Record<string, string>) => {
    metaHashes.set(key, { ...metaHashes.get(key), ...fields })
    return Object.keys(fields).length
  }),
  hgetall: vi.fn(async (key: string) => {
    return metaHashes.get(key) ?? {}
  }),
  pexpireat: vi.fn(async () => 1),
  set: vi.fn(async (key: string) => {
    if (key.startsWith('session:')) {
      sessionBlobs.add(key)
    }
    return 'OK'
  }),
  exists: vi.fn(async (key: string) => (sessionBlobs.has(key) ? 1 : 0)),
  del: vi.fn(async (key: string) => {
    metaHashes.delete(key)
    userSets.delete(key)
    sessionBlobs.delete(key)
    return 1
  }),
  srem: vi.fn(async () => 1),
  pipeline: () => {
    const ops: Array<() => Promise<unknown>> = []
    const results: unknown[] = []
    const builder = {
      del(key: string) {
        ops.push(async () => {
          metaHashes.delete(key)
          userSets.delete(key)
          sessionBlobs.delete(key)
          results.push([null, 1])
        })
        return builder
      },
      srem() {
        ops.push(async () => results.push([null, 1]))
        return builder
      },
      exists(key: string) {
        ops.push(async () => results.push([null, sessionBlobs.has(key) ? 1 : 0]))
        return builder
      },
      hgetall(key: string) {
        ops.push(async () => results.push([null, metaHashes.get(key) ?? {}]))
        return builder
      },
      async exec() {
        for (const op of ops) {
          await op()
        }
        return results
      },
    }
    return builder
  },
}

vi.mock('@/server/infra/redis/storage', () => ({
  redisInstance: () => redisStub,
}))

vi.mock('@/server/infra/db/operations/user', () => ({
  findUsersByIds: vi.fn(async () => []),
}))

const [{ listSessionsByUser }, { recordSessionLogin }] = await Promise.all([
  import('@/server/domains/auth/service'),
  import('@/server/domains/auth/repo'),
])

beforeEach(() => {
  userSets.clear()
  metaHashes.clear()
  sessionBlobs.clear()
  redisStub.sadd.mockClear()
  redisStub.smembers.mockClear()
  redisStub.hset.mockClear()
  redisStub.hgetall.mockClear()
})

describe('listSessionsByUser', () => {
  it('joins the user_sessions set with each session_meta hash and returns parsed metadata', async () => {
    const userId = 42n
    const loginAt = new Date('2026-05-01T08:00:00Z')

    // Seed two sessions for the same user. `recordSessionLogin` writes
    // the meta hash, and we manually mirror what `establishLoginSession`
    // would also do (SADD into `user_sessions:<id>` AND populate the
    // cookie blob at `session:<sid>` so the new liveness check
    // confirms them as active).
    await redisStub.sadd(`user_sessions:${userId}`, 'sid-a')
    sessionBlobs.add('session:sid-a')
    await recordSessionLogin({
      sid: 'sid-a',
      userId,
      userAgent: 'Mozilla/5.0 (Macintosh) Chrome/120',
      ip: '203.0.113.1',
      loginAt,
    })
    await redisStub.sadd(`user_sessions:${userId}`, 'sid-b')
    sessionBlobs.add('session:sid-b')
    await recordSessionLogin({
      sid: 'sid-b',
      userId,
      userAgent: null,
      ip: '203.0.113.2',
      loginAt,
    })

    // A session id that exists in the set but whose cookie blob has
    // been evicted: must be filtered out (and lazily cleaned), NOT
    // yield an empty row. Deliberately no `sessionBlobs.add` here.
    await redisStub.sadd(`user_sessions:${userId}`, 'sid-orphan')

    const sessions = await listSessionsByUser(userId)
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
    const sessions = await listSessionsByUser(7n)
    expect(sessions).toEqual([])
  })
})
