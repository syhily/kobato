import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionMeta } from '@/server/domains/auth/repo'
import type { Database } from '@/server/infra/db/database'

// auth/services/sessions.ts orchestrates the repo's session-table primitives and
// the user-table join. The pure surface we exercise here is:
//   - revokeAllSessionsOfUser — db/except delegation + rowCount passthrough.
//   - listSessionsByUser — straight delegation to the repo.
//   - listAllSessions — empty short-circuit, user-id dedup, the user join
//     with the deleted-user fallback.
// The revocation policy moved to `session-guard.ts` and is covered by
// tests/unit/server/domains/auth/session-guard.test.ts.

const repoMocks = vi.hoisted(() => ({
  deleteSessionsOfUser: vi.fn(),
  listLiveSessions: vi.fn(),
  listLiveSessionsByUser: vi.fn(),
}))

const findUsersByIdsMock = vi.hoisted(() => vi.fn())

vi.mock('@/server/domains/auth/repo', () => repoMocks)
vi.mock('@/server/infra/db/operations/user', () => ({
  findUsersByIds: findUsersByIdsMock,
}))

const { revokeAllSessionsOfUser, listSessionsByUser, listAllSessions } =
  await import('@/server/domains/auth/services/sessions')

const fakeDb = {} as Database

function meta(userId: number, sid = 's1', ip = '1.1.1.1', ua = 'ua'): SessionMeta {
  return {
    sid,
    userId,
    userAgent: ua,
    platformHint: null,
    ip,
    loginAt: new Date(1_700_000_000_000),
    lastActiveAt: new Date(1_700_000_001_000),
    expiresAt: new Date(1_700_000_002_000),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  repoMocks.deleteSessionsOfUser.mockResolvedValue(0)
  repoMocks.listLiveSessions.mockResolvedValue([])
  repoMocks.listLiveSessionsByUser.mockResolvedValue([])
  findUsersByIdsMock.mockResolvedValue([])
})

describe('auth/services/sessions — revokeAllSessionsOfUser', () => {
  it('delegates to the repo with db + userId and returns the deleted count', async () => {
    repoMocks.deleteSessionsOfUser.mockResolvedValue(3)
    const count = await revokeAllSessionsOfUser(fakeDb, 1)
    expect(repoMocks.deleteSessionsOfUser).toHaveBeenCalledWith(fakeDb, 1, undefined)
    expect(count).toBe(3)
  })

  it('passes exceptSessionId through so the caller session survives', async () => {
    repoMocks.deleteSessionsOfUser.mockResolvedValue(2)
    const count = await revokeAllSessionsOfUser(fakeDb, 1, 'keep-me')
    expect(repoMocks.deleteSessionsOfUser).toHaveBeenCalledWith(fakeDb, 1, 'keep-me')
    expect(count).toBe(2)
  })
})

describe('auth/services/sessions — listSessionsByUser', () => {
  it('returns [] when the user has no live sessions', async () => {
    const result = await listSessionsByUser(fakeDb, 1)
    expect(repoMocks.listLiveSessionsByUser).toHaveBeenCalledWith(fakeDb, 1)
    expect(result).toEqual([])
  })

  it('returns the repo metas verbatim', async () => {
    repoMocks.listLiveSessionsByUser.mockResolvedValue([meta(1, 's1'), meta(1, 's2')])
    const result = await listSessionsByUser(fakeDb, 1)
    expect(result.map((s) => s.sid)).toEqual(['s1', 's2'])
  })
})

describe('auth/services/sessions — listAllSessions', () => {
  it('returns [] and skips the user join when there are no live sessions', async () => {
    const result = await listAllSessions(fakeDb)
    expect(result).toEqual([])
    expect(findUsersByIdsMock).not.toHaveBeenCalled()
  })

  it('joins live metas with users', async () => {
    repoMocks.listLiveSessions.mockResolvedValue([meta(5, 's1', '2.2.2.2', 'ua2')])
    findUsersByIdsMock.mockResolvedValue([{ id: 5, name: 'Alice', email: 'a@x', role: 'admin' }])
    const result = await listAllSessions(fakeDb)
    expect(result).toHaveLength(1)
    expect(result[0]!.userName).toBe('Alice')
    expect(result[0]!.userRole).toBe('admin')
    expect(result[0]!.ip).toBe('2.2.2.2')
  })

  it('dedups user ids before the bulk user read', async () => {
    repoMocks.listLiveSessions.mockResolvedValue([meta(5, 's1'), meta(5, 's2')])
    findUsersByIdsMock.mockResolvedValue([{ id: 5, name: 'Alice', email: 'a@x', role: 'admin' }])
    const result = await listAllSessions(fakeDb)
    expect(findUsersByIdsMock).toHaveBeenCalledWith(fakeDb, [5])
    expect(result).toHaveLength(2)
  })

  it('uses the deleted-user fallback when no user row matches', async () => {
    repoMocks.listLiveSessions.mockResolvedValue([meta(9, 's1', '3.3.3.3', '')])
    findUsersByIdsMock.mockResolvedValue([])
    const result = await listAllSessions(fakeDb)
    expect(result[0]!.userName).toBe('已删除的用户')
    expect(result[0]!.userEmail).toBe('')
    expect(result[0]!.userRole).toBeNull()
  })

  it('soft-caps the session read at 10k rows', async () => {
    await listAllSessions(fakeDb)
    expect(repoMocks.listLiveSessions).toHaveBeenCalledWith(fakeDb, 10_000)
  })
})
