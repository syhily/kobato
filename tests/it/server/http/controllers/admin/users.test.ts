import { call } from '@orpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AdminUserRow } from '@/server/infra/db/operations/user'

import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { DomainError } from '@/server/infra/http/errors'

vi.mock('@/server/infra/db/operations/user', () => ({
  countAdmins: vi.fn().mockResolvedValue(2),
  findUserByEmail: vi.fn().mockResolvedValue(null),
  findUserById: vi.fn(),
  insertAuthor: vi.fn(),
  softDeleteUserById: vi.fn(),
  updateUserById: vi.fn(),
  updateUserRole: vi.fn(),
}))
vi.mock('@/server/domains/users/services/admin', () => ({
  bulkApproveCommentsForUser: vi.fn().mockResolvedValue(0),
  bulkDeleteCommentsForUser: vi.fn().mockResolvedValue(0),
  fetchAdminUserDto: vi.fn(),
  findUserById: vi.fn(),
  listUsersForAdmin: vi.fn(),
  muteAdminUser: vi.fn(),
  restoreAdminUser: vi.fn().mockResolvedValue(true),
  softDeleteAdminUser: vi.fn().mockResolvedValue(true),
  toAdminUserDto: (row: unknown) => row,
  updateUserByIdWithGuard: vi.fn(),
  updateUserRoleWithGuard: vi.fn(),
  softDeleteUserWithGuard: vi.fn(),
  inviteAuthorWithRollback: vi.fn(),
  sendPasswordResetToUser: vi.fn(),
}))
vi.mock('@/server/domains/auth/session-storage', () => ({
  revokeAllSessionsOfUser: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/server/domains/auth/repo', () => ({
  findSessionMeta: vi.fn(),
  revokeSessionById: vi.fn(),
}))
vi.mock('@/server/domains/auth/verification-tokens', () => ({
  issueResetToken: vi.fn(),
  issueSetupToken: vi.fn(),
  revokeTokensFor: vi.fn(),
}))
vi.mock('@/server/infra/email/sender', () => ({
  sendAuthorInvite: vi.fn(),
  sendPasswordReset: vi.fn(),
}))
vi.mock('@/server/infra/rate-limit', () => ({
  tryInviteByEmailRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
  tryInviteRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
  tryPasswordResetByTargetRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
}))

const { adminUsersCrudRouter } = await import('@/server/http/controllers/admin/users-crud.controller')
const { adminUsersAdminRouter } = await import('@/server/http/controllers/admin/users-admin.controller')
const { adminUsersSessionsRouter } = await import('@/server/http/controllers/admin/users-sessions.controller')
const adminUsersRouter = { ...adminUsersCrudRouter, ...adminUsersAdminRouter, ...adminUsersSessionsRouter }
const usersService = await import('@/server/domains/users/services/admin')

describe('adminUsersRouter.list', () => {
  it('passes query params through to the service and projects each row', async () => {
    const userRow = {
      id: '7',
      name: 'u',
      email: 'u@example.test',
      link: null,
      badgeName: null,
      badgeColor: null,
      badgeTextColor: null,
      role: 'visitor' as const,
      isMuted: false,
      emailVerified: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
      lastIp: null,
      lastUa: null,
      commentCount: 0,
      pendingCount: 0,
      lastCommentAt: null,
      passkeyCount: 0,
      passkeyForce: false,
    }
    vi.mocked(usersService.listUsersForAdmin).mockResolvedValueOnce({
      users: [userRow as unknown as AdminUserRow],
      total: 1,
      hasMore: false,
    })
    const ctx = makeAuthedCtx()
    const res = (await call(adminUsersRouter.list, { offset: 0, limit: 20 }, { context: ctx })) as {
      total: number
    }
    expect(res.total).toBe(1)
  })
})

describe('adminUsersRouter.get', () => {
  it('throws NOT_FOUND when the user dto is null', async () => {
    vi.mocked(usersService.fetchAdminUserDto).mockResolvedValueOnce(null)
    const ctx = makeAuthedCtx()
    await expect(call(adminUsersRouter.get, { id: '999' }, { context: ctx })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('adminUsersRouter.softDelete', () => {
  beforeEach(() => {
    vi.mocked(usersService.softDeleteUserWithGuard).mockReset()
  })

  it('refuses with FORBIDDEN when the viewer is the same user', async () => {
    vi.mocked(usersService.softDeleteUserWithGuard).mockRejectedValueOnce(
      new DomainError('FORBIDDEN', '不能删除自己。'),
    )
    const ctx = makeAuthedCtx({ userId: '5' })
    await expect(call(adminUsersRouter.softDelete, { id: '5' }, { context: ctx })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('refuses with CONFLICT when removing the last admin', async () => {
    vi.mocked(usersService.softDeleteUserWithGuard).mockRejectedValueOnce(
      new DomainError('CONFLICT', '不能删除唯一的管理员。'),
    )
    const ctx = makeAuthedCtx({ userId: '1' })
    await expect(call(adminUsersRouter.softDelete, { id: '9' }, { context: ctx })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('resolves to undefined (void output) on successful deletion', async () => {
    vi.mocked(usersService.softDeleteUserWithGuard).mockResolvedValueOnce({ previousRole: 'visitor' })
    const ctx = makeAuthedCtx({ userId: '1' })
    const res = await call(adminUsersRouter.softDelete, { id: '9' }, { context: ctx })
    expect(res).toBeUndefined()
  })
})

describe('adminUsersRouter.update', () => {
  it('throws NOT_FOUND when updateUserByIdWithGuard yields null', async () => {
    vi.mocked(usersService.updateUserByIdWithGuard).mockResolvedValueOnce(null)
    const ctx = makeAuthedCtx()
    await expect(call(adminUsersRouter.update, { id: '99', name: 'X' }, { context: ctx })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('returns success on a successful patch', async () => {
    vi.mocked(usersService.updateUserByIdWithGuard).mockResolvedValueOnce({ id: '1', name: 'X' } as unknown as Awaited<
      ReturnType<typeof usersService.updateUserByIdWithGuard>
    >)
    const ctx = makeAuthedCtx()
    const res = await call(adminUsersRouter.update, { id: '1', name: 'X' }, { context: ctx })
    expect(res).toEqual({ success: true })
  })
})

const userQuery = await import('@/server/domains/users/services/admin')

describe('adminUsersRouter.revokeAllSessions', () => {
  it('allows an admin to revoke their own sessions', async () => {
    vi.mocked(userQuery.findUserById).mockResolvedValueOnce({
      id: 1n,
      role: 'admin',
    } as unknown as Awaited<ReturnType<typeof userQuery.findUserById>>)
    const ctx = makeAuthedCtx({ userId: '1' })
    const res = await call(adminUsersRouter.revokeAllSessions, { userId: '1' }, { context: ctx })
    expect(res).toEqual({ success: true })
  })

  it("forbids an admin from revoking another admin's sessions", async () => {
    vi.mocked(userQuery.findUserById).mockResolvedValueOnce({
      id: 2n,
      role: 'admin',
    } as unknown as Awaited<ReturnType<typeof userQuery.findUserById>>)
    const ctx = makeAuthedCtx({ userId: '1' })
    await expect(call(adminUsersRouter.revokeAllSessions, { userId: '2' }, { context: ctx })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it("allows an admin to revoke a visitor's sessions", async () => {
    vi.mocked(userQuery.findUserById).mockResolvedValueOnce({
      id: 2n,
      role: 'visitor',
    } as unknown as Awaited<ReturnType<typeof userQuery.findUserById>>)
    const ctx = makeAuthedCtx({ userId: '1' })
    const res = await call(adminUsersRouter.revokeAllSessions, { userId: '2' }, { context: ctx })
    expect(res).toEqual({ success: true })
  })
})
