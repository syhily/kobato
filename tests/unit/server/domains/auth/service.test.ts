import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// auth/service.ts orchestrates Redis + DB reads. The pure surface we
// exercise here is the branching in:
//   - listSessionsByUser — empty set, empty-string filtering, orphan
//     cleanup, meta parse + userId filtering.
//   - listAllSessions — SCAN cursor loop, orphan vs live split, user
//     join with deleted-user fallback.
//   - revokeSessionWithGuard — missing meta, admin-on-other-admin guard.
// We stub redisInstance so every Redis call is deterministic, and stub
// the user DB ops.

// ─── Redis stub ──────────────────────────────────────────
// Each test shapes the mutable `state` object, then `newRedis()` returns
// a fresh stub whose methods read from it. Pipelines collect commands
// and resolve their exec() from `state.pipelineBatches`.

interface RedisState {
  smembers: string[]
  scanPages: Array<[string, string[]]>
  // Queue of pipeline-result tuples; each pipeline().exec() drains one batch.
  pipelineBatches: unknown[][]
}

function freshState(): RedisState {
  return { smembers: [], scanPages: [['0', []]], pipelineBatches: [] }
}

let state = freshState()

function newRedis() {
  let scanIdx = 0
  const mkPipeline = () => {
    return {
      exists(_k: string) {
        return this
      },
      hgetall(_k: string) {
        return this
      },
      del(_k: string) {
        return this
      },
      srem(_k: string) {
        return this
      },
      async exec() {
        const batch = state.pipelineBatches.shift() ?? []
        return batch
      },
    }
  }
  return {
    smembers: vi.fn(async () => state.smembers),
    scan: vi.fn(async () => {
      const page = state.scanPages[scanIdx] ?? ['0', []]
      scanIdx += 1
      return page
    }),
    exists: vi.fn(async () => 0),
    hgetall: vi.fn(async () => ({})),
    del: vi.fn(async () => 0),
    pipeline: vi.fn(() => mkPipeline()),
  }
}

const mockRedis = newRedis()

const findSessionMetaMock = vi.hoisted(() => vi.fn())
const revokeSessionByIdMock = vi.hoisted(() => vi.fn())
const findSafeUserByIdMock = vi.hoisted(() => vi.fn())
const findUsersByIdsMock = vi.hoisted(() => vi.fn())

vi.mock('@/server/infra/redis/storage', () => ({ redisInstance: () => mockRedis }))
vi.mock('@/server/infra/logger', () => ({ getLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() }) }))
vi.mock('@/server/domains/auth/repo', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/auth/repo')>('@/server/domains/auth/repo')
  return {
    ...actual,
    findSessionMeta: findSessionMetaMock,
    revokeSessionById: revokeSessionByIdMock,
  }
})
vi.mock('@/server/infra/db/operations/user', () => ({
  findSafeUserById: findSafeUserByIdMock,
  findUsersByIds: findUsersByIdsMock,
}))

const { listSessionsByUser, listAllSessions, revokeSessionWithGuard } = await import('@/server/domains/auth/service')

const fakeDb = {} as NodePgDatabase

// Hash shapes matching parseMeta's expectations. Every value MUST be a
// string — isStringRecord rejects hashes containing null/number values.
function metaHash(userId: string, ip = '1.1.1.1', ua = 'ua') {
  return {
    userId,
    ip,
    userAgent: ua,
    platformHint: '',
    loginAt: '1700000000000',
    lastActiveAt: '1700000001000',
    expiresAt: '1700000002000',
  }
}

describe('auth/service — session orchestration branches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state = freshState()
    // Reset the redis method implementations in place (don't reassign the
    // object — the vi.mock closure captured this exact reference).
    Object.assign(mockRedis, newRedis())
    revokeSessionByIdMock.mockResolvedValue(undefined)
    findSafeUserByIdMock.mockResolvedValue(null)
    findUsersByIdsMock.mockResolvedValue([])
  })

  describe('listSessionsByUser', () => {
    it('returns [] when the user has no session set', async () => {
      const result = await listSessionsByUser(fakeDb, 1n)
      expect(result).toEqual([])
    })

    it('returns [] when every set member is an empty string', async () => {
      state.smembers = ['', '']
      const result = await listSessionsByUser(fakeDb, 1n)
      expect(result).toEqual([])
    })

    it('returns [] when no candidate session survives the EXISTS check', async () => {
      state.smembers = ['s1', 's2']
      // Pipeline 0 (exists): both 0 → orphans → cleanup pipeline then empty live.
      state.pipelineBatches = [
        [
          [null, 0],
          [null, 0],
        ],
      ]
      const result = await listSessionsByUser(fakeDb, 1n)
      expect(result).toEqual([])
    })

    it('parses live session metas and filters out other-user rows', async () => {
      state.smembers = ['s1']
      // Pipeline 0 (exists): s1 live. Pipeline 1 (hgetall): returns the hash.
      state.pipelineBatches = [[[null, 1]], [[null, metaHash('1')]]]
      const result = await listSessionsByUser(fakeDb, 1n)
      expect(result).toHaveLength(1)
      expect(result[0]!.userId).toBe(1n)
    })

    it('filters out metas whose hash has non-string values (isStringRecord guard)', async () => {
      state.smembers = ['s1']
      state.pipelineBatches = [[[null, 1]], [[null, { userId: '1', bad: null }]]]
      const result = await listSessionsByUser(fakeDb, 1n)
      expect(result).toEqual([])
    })

    it('drops metas belonging to a different user', async () => {
      state.smembers = ['s1', 's2']
      state.pipelineBatches = [
        [
          [null, 1],
          [null, 1],
        ], // both live
        [
          [null, metaHash('1')],
          [null, metaHash('999')],
        ], // second is other-user
      ]
      const result = await listSessionsByUser(fakeDb, 1n)
      expect(result).toHaveLength(1)
      expect(result[0]!.userId).toBe(1n)
    })
  })

  describe('listAllSessions', () => {
    it('returns [] when SCAN finds no session_meta keys', async () => {
      const result = await listAllSessions(fakeDb)
      expect(result).toEqual([])
    })

    it('returns [] when all scanned sids are orphaned', async () => {
      state.scanPages = [['0', ['session_meta:s1', 'session_meta:s2']]]
      // Pipeline 0 (exists): both 0 → orphans only → cleanup + empty.
      state.pipelineBatches = [
        [
          [null, 0],
          [null, 0],
        ],
      ]
      const result = await listAllSessions(fakeDb)
      expect(result).toEqual([])
    })

    it('joins live metas with users and falls back for deleted users', async () => {
      state.scanPages = [['0', ['session_meta:s1']]]
      state.pipelineBatches = [
        [[null, 1]], // exists
        [[null, metaHash('5', '2.2.2.2', 'ua2')]], // hgetall
      ]
      findUsersByIdsMock.mockResolvedValue([{ id: 5n, name: 'Alice', email: 'a@x', role: 'admin' }])
      const result = await listAllSessions(fakeDb)
      expect(result).toHaveLength(1)
      expect(result[0]!.userName).toBe('Alice')
      expect(result[0]!.userRole).toBe('admin')
    })

    it('uses the deleted-user fallback when no user row matches', async () => {
      state.scanPages = [['0', ['session_meta:s1']]]
      state.pipelineBatches = [[[null, 1]], [[null, metaHash('9', '3.3.3.3', '')]]]
      findUsersByIdsMock.mockResolvedValue([])
      const result = await listAllSessions(fakeDb)
      expect(result[0]!.userName).toBe('已删除的用户')
      expect(result[0]!.userEmail).toBe('')
      expect(result[0]!.userRole).toBeNull()
    })

    it('stops the SCAN loop once MAX_SESSIONS_SCAN is exceeded', async () => {
      const huge = Array.from({ length: 11_000 }, (_, i) => `session_meta:s${i}`)
      state.scanPages = [
        ['42', huge],
        ['0', []],
      ]
      await listAllSessions(fakeDb)
      // Only the first SCAN page should have been consumed (cap reached).
      expect(mockRedis.scan).toHaveBeenCalledTimes(1)
    })
  })

  describe('revokeSessionWithGuard', () => {
    it('returns targetUserId:null when the session meta is missing', async () => {
      findSessionMetaMock.mockResolvedValue(null)
      const result = await revokeSessionWithGuard(fakeDb, 'sid', '1', 'admin')
      expect(result).toEqual({ targetUserId: null })
      expect(revokeSessionByIdMock).not.toHaveBeenCalled()
    })

    it('revokes immediately when the actor owns the session', async () => {
      findSessionMetaMock.mockResolvedValue({ userId: 1n, sid: 'sid' })
      const result = await revokeSessionWithGuard(fakeDb, 'sid', '1', 'admin')
      expect(result.targetUserId).toBe(1n)
      expect(revokeSessionByIdMock).toHaveBeenCalledWith('sid', 1n)
    })

    it('revokes when a non-admin targets another user (no admin guard)', async () => {
      findSessionMetaMock.mockResolvedValue({ userId: 2n, sid: 'sid' })
      const result = await revokeSessionWithGuard(fakeDb, 'sid', '1', 'visitor')
      expect(result.targetUserId).toBe(2n)
      expect(revokeSessionByIdMock).toHaveBeenCalled()
    })

    it('throws FORBIDDEN when an admin targets another live admin', async () => {
      findSessionMetaMock.mockResolvedValue({ userId: 2n, sid: 'sid' })
      findSafeUserByIdMock.mockResolvedValue({ id: 2n, role: 'admin', deletedAt: null })
      await expect(revokeSessionWithGuard(fakeDb, 'sid', '1', 'admin')).rejects.toThrow(/无权撤销其他管理员/)
      expect(revokeSessionByIdMock).not.toHaveBeenCalled()
    })

    it('revokes when the target admin has been soft-deleted', async () => {
      findSessionMetaMock.mockResolvedValue({ userId: 2n, sid: 'sid' })
      findSafeUserByIdMock.mockResolvedValue({ id: 2n, role: 'admin', deletedAt: new Date() })
      const result = await revokeSessionWithGuard(fakeDb, 'sid', '1', 'admin')
      expect(result.targetUserId).toBe(2n)
      expect(revokeSessionByIdMock).toHaveBeenCalled()
    })

    it('revokes when the target is a non-admin user', async () => {
      findSessionMetaMock.mockResolvedValue({ userId: 2n, sid: 'sid' })
      findSafeUserByIdMock.mockResolvedValue({ id: 2n, role: 'visitor', deletedAt: null })
      const result = await revokeSessionWithGuard(fakeDb, 'sid', '1', 'admin')
      expect(result.targetUserId).toBe(2n)
      expect(revokeSessionByIdMock).toHaveBeenCalled()
    })
  })
})
