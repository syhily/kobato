import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ViewerIdentity } from '@/server/domains/auth/rbac'
import type { Database } from '@/server/infra/db/database'

// auth/session-guard.ts owns the "who may revoke whose session" policy
// for all three scopes (own / admin / bulk). We stub the role-blind
// session-table primitives (repo + service) and the user lookup so each
// test drives exactly one policy branch.

const findSessionMetaMock = vi.hoisted(() => vi.fn())
const revokeSessionByIdMock = vi.hoisted(() => vi.fn())
const revokeAllSessionsOfUserMock = vi.hoisted(() => vi.fn())
const findSafeUserByIdMock = vi.hoisted(() => vi.fn())

vi.mock('@/server/domains/auth/repo', () => ({
  findSessionMeta: findSessionMetaMock,
  revokeSessionById: revokeSessionByIdMock,
}))

vi.mock('@/server/domains/auth/services/sessions', () => ({
  revokeAllSessionsOfUser: revokeAllSessionsOfUserMock,
}))

vi.mock('@/server/infra/db/operations/user', () => ({
  findSafeUserById: findSafeUserByIdMock,
}))

const { revokeOwnSessionWithGuard, revokeSessionWithGuard, revokeAllSessionsWithGuard } =
  await import('@/server/domains/auth/session-guard')
const { DomainError } = await import('@/server/infra/http/errors')

const fakeDb = {} as Database

function actor(id: string, role: ViewerIdentity['role'] = 'admin'): ViewerIdentity {
  return { id, role }
}

describe('auth/session-guard — revokeOwnSessionWithGuard (own scope)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    revokeSessionByIdMock.mockResolvedValue(undefined)
  })

  it('returns targetUserId:null when the session meta is missing (no-op)', async () => {
    findSessionMetaMock.mockResolvedValue(null)
    const result = await revokeOwnSessionWithGuard(fakeDb, 'sid', actor('1'))
    expect(result).toEqual({ targetUserId: null })
    expect(revokeSessionByIdMock).not.toHaveBeenCalled()
  })

  it('revokes when the actor owns the session', async () => {
    findSessionMetaMock.mockResolvedValue({ userId: 1, sid: 'sid' })
    const result = await revokeOwnSessionWithGuard(fakeDb, 'sid', actor('1', 'visitor'))
    expect(result.targetUserId).toBe(1)
    expect(revokeSessionByIdMock).toHaveBeenCalledWith(fakeDb, 'sid', 1)
  })

  it('throws FORBIDDEN when the session belongs to another user — even for an admin actor (no bypass)', async () => {
    findSessionMetaMock.mockResolvedValue({ userId: 999, sid: 'sid' })
    await expect(revokeOwnSessionWithGuard(fakeDb, 'sid', actor('1', 'admin'))).rejects.toThrow('无权操作该会话。')
    expect(revokeSessionByIdMock).not.toHaveBeenCalled()
  })
})

describe('auth/session-guard — revokeSessionWithGuard (admin scope)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    revokeSessionByIdMock.mockResolvedValue(undefined)
    findSafeUserByIdMock.mockResolvedValue(null)
  })

  it('returns targetUserId:null when the session meta is missing', async () => {
    findSessionMetaMock.mockResolvedValue(null)
    const result = await revokeSessionWithGuard(fakeDb, 'sid', actor('1'))
    expect(result).toEqual({ targetUserId: null })
    expect(revokeSessionByIdMock).not.toHaveBeenCalled()
  })

  it('revokes immediately when the actor owns the session', async () => {
    findSessionMetaMock.mockResolvedValue({ userId: 1, sid: 'sid' })
    const result = await revokeSessionWithGuard(fakeDb, 'sid', actor('1'))
    expect(result.targetUserId).toBe(1)
    expect(revokeSessionByIdMock).toHaveBeenCalledWith(fakeDb, 'sid', 1)
    expect(findSafeUserByIdMock).not.toHaveBeenCalled()
  })

  it('revokes when a non-admin actor targets another user (unreachable via adminProc; no guard fires)', async () => {
    findSessionMetaMock.mockResolvedValue({ userId: 2, sid: 'sid' })
    const result = await revokeSessionWithGuard(fakeDb, 'sid', actor('1', 'visitor'))
    expect(result.targetUserId).toBe(2)
    expect(revokeSessionByIdMock).toHaveBeenCalled()
  })

  it('throws FORBIDDEN when an admin targets another live admin', async () => {
    findSessionMetaMock.mockResolvedValue({ userId: 2, sid: 'sid' })
    findSafeUserByIdMock.mockResolvedValue({ id: 2, role: 'admin', deletedAt: null })
    await expect(revokeSessionWithGuard(fakeDb, 'sid', actor('1'))).rejects.toThrow(
      new DomainError('FORBIDDEN', '无权撤销其他管理员的会话。'),
    )
    expect(revokeSessionByIdMock).not.toHaveBeenCalled()
  })

  it('revokes when the target admin has been soft-deleted', async () => {
    findSessionMetaMock.mockResolvedValue({ userId: 2, sid: 'sid' })
    findSafeUserByIdMock.mockResolvedValue({ id: 2, role: 'admin', deletedAt: new Date() })
    const result = await revokeSessionWithGuard(fakeDb, 'sid', actor('1'))
    expect(result.targetUserId).toBe(2)
    expect(revokeSessionByIdMock).toHaveBeenCalled()
  })

  it('revokes when the target is a non-admin user', async () => {
    findSessionMetaMock.mockResolvedValue({ userId: 2, sid: 'sid' })
    findSafeUserByIdMock.mockResolvedValue({ id: 2, role: 'visitor', deletedAt: null })
    const result = await revokeSessionWithGuard(fakeDb, 'sid', actor('1'))
    expect(result.targetUserId).toBe(2)
    expect(revokeSessionByIdMock).toHaveBeenCalled()
  })
})

describe('auth/session-guard — revokeAllSessionsWithGuard (bulk scope)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    revokeAllSessionsOfUserMock.mockResolvedValue(undefined)
    findSafeUserByIdMock.mockResolvedValue(null)
  })

  it('allows an admin to bulk-revoke their own sessions', async () => {
    findSafeUserByIdMock.mockResolvedValue({ id: 1, role: 'admin', deletedAt: null })
    await revokeAllSessionsWithGuard(fakeDb, 1, actor('1'))
    expect(revokeAllSessionsOfUserMock).toHaveBeenCalledWith(fakeDb, 1)
  })

  it('allows an admin to bulk-revoke a non-admin user', async () => {
    findSafeUserByIdMock.mockResolvedValue({ id: 2, role: 'visitor', deletedAt: null })
    await revokeAllSessionsWithGuard(fakeDb, 2, actor('1'))
    expect(revokeAllSessionsOfUserMock).toHaveBeenCalledWith(fakeDb, 2)
  })

  it('throws FORBIDDEN when an admin bulk-revokes another admin', async () => {
    findSafeUserByIdMock.mockResolvedValue({ id: 2, role: 'admin', deletedAt: null })
    await expect(revokeAllSessionsWithGuard(fakeDb, 2, actor('1'))).rejects.toThrow(
      new DomainError('FORBIDDEN', '无权撤销其他管理员的全部会话。'),
    )
    expect(revokeAllSessionsOfUserMock).not.toHaveBeenCalled()
  })

  it('still throws FORBIDDEN when the other admin is soft-deleted (no exemption in bulk scope)', async () => {
    findSafeUserByIdMock.mockResolvedValue({ id: 2, role: 'admin', deletedAt: new Date() })
    await expect(revokeAllSessionsWithGuard(fakeDb, 2, actor('1'))).rejects.toThrow('无权撤销其他管理员的全部会话。')
    expect(revokeAllSessionsOfUserMock).not.toHaveBeenCalled()
  })

  it('proceeds when the target user row is missing', async () => {
    findSafeUserByIdMock.mockResolvedValue(null)
    await revokeAllSessionsWithGuard(fakeDb, 2, actor('1'))
    expect(revokeAllSessionsOfUserMock).toHaveBeenCalledWith(fakeDb, 2)
  })
})
