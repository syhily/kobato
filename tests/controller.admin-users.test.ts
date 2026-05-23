import { call } from '@orpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from './_helpers/mock-ctx'

vi.mock('@/server/infra/db/operations/user', () => ({
  countAdmins: vi.fn().mockResolvedValue(2),
  findUserByEmail: vi.fn().mockResolvedValue(null),
  findUserById: vi.fn(),
  insertAuthor: vi.fn(),
  softDeleteUserById: vi.fn(),
  updateUserById: vi.fn(),
  updateUserRole: vi.fn(),
}))
vi.mock('@/server/domains/users/service', () => ({
  bulkApproveCommentsForUser: vi.fn().mockResolvedValue(0),
  bulkDeleteCommentsForUser: vi.fn().mockResolvedValue(0),
  fetchAdminUserDto: vi.fn(),
  listUsersForAdmin: vi.fn(),
  muteAdminUser: vi.fn(),
  restoreAdminUser: vi.fn().mockResolvedValue(true),
  softDeleteAdminUser: vi.fn().mockResolvedValue(true),
  toAdminUserDto: (row: unknown) => row,
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
const userQuery = await import('@/server/infra/db/operations/user')
const usersService = await import('@/server/domains/users/service')

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
    }
    vi.mocked(usersService.listUsersForAdmin).mockResolvedValueOnce({
      users: [userRow as never],
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
    vi.mocked(userQuery.findUserById).mockResolvedValue({ id: 2n, role: 'visitor' } as never)
  })

  it('refuses with FORBIDDEN when the viewer is the same user', async () => {
    const ctx = makeAuthedCtx({ userId: '5' })
    await expect(call(adminUsersRouter.softDelete, { id: '5' }, { context: ctx })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('refuses with CONFLICT when removing the last admin', async () => {
    vi.mocked(userQuery.findUserById).mockResolvedValueOnce({ id: 9n, role: 'admin' } as never)
    vi.mocked(userQuery.countAdmins).mockResolvedValueOnce(1)
    const ctx = makeAuthedCtx({ userId: '1' })
    await expect(call(adminUsersRouter.softDelete, { id: '9' }, { context: ctx })).rejects.toMatchObject({
      code: 'CONFLICT',
    })
  })

  it('resolves to undefined (void output) on successful deletion and revokes sessions', async () => {
    vi.mocked(userQuery.findUserById).mockResolvedValueOnce({ id: 9n, role: 'visitor' } as never)
    const ctx = makeAuthedCtx({ userId: '1' })
    const res = await call(adminUsersRouter.softDelete, { id: '9' }, { context: ctx })
    expect(res).toBeUndefined()
    const sessionStorage = await import('@/server/domains/auth/session-storage')
    expect(vi.mocked(sessionStorage.revokeAllSessionsOfUser)).toHaveBeenCalledWith(9n)
  })
})

describe('adminUsersRouter.update', () => {
  it('throws NOT_FOUND when updateUserById yields null', async () => {
    vi.mocked(userQuery.updateUserById).mockResolvedValueOnce(null)
    const ctx = makeAuthedCtx()
    await expect(call(adminUsersRouter.update, { id: '99', name: 'X' }, { context: ctx })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('returns success on a successful patch', async () => {
    vi.mocked(userQuery.updateUserById).mockResolvedValueOnce({ id: '1', name: 'X' } as never)
    const ctx = makeAuthedCtx()
    const res = await call(adminUsersRouter.update, { id: '1', name: 'X' }, { context: ctx })
    expect(res).toEqual({ success: true })
  })
})
