import { ORPCError, call } from '@orpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from './_helpers/mock-ctx'

// Stub bcrypt so tests stay sync-friendly and don't pay for key
// derivation. The controller only cares about boolean compare.
vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn().mockResolvedValue(true),
    hash: vi.fn().mockResolvedValue('hashed:new-password'),
  },
}))

vi.mock('@/server/infra/db/operations/user', () => ({
  findUserById: vi.fn(),
  updateUserById: vi.fn(),
  PASSWORD_HASH_ROUNDS: 12,
}))

vi.mock('@/server/domains/auth/session-storage', () => ({
  revokeAllSessionsOfUser: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/server/domains/auth/repo', () => ({
  findSessionMeta: vi.fn(),
  revokeSessionById: vi.fn().mockResolvedValue(true),
}))

const { findUserById, updateUserById } = await import('@/server/infra/db/operations/user')
const { revokeAllSessionsOfUser } = await import('@/server/domains/auth/session-storage')
const { revokeSessionById } = await import('@/server/domains/auth/repo')
const { accountRouter } = await import('@/server/http/controllers/account.controller')

const dbUserStub = {
  id: 1n,
  name: 'Alice',
  email: 'alice@example.com',
  link: null,
  password: 'hashed:old-password',
  badgeName: null,
  badgeColor: null,
  badgeTextColor: null,
  role: 'visitor' as const,
  receiveEmail: true,
  emailVerified: true,
}

const updatedUserStub = {
  id: '1',
  name: 'Alice',
  email: 'alice@example.com',
  link: null,
  badgeName: null,
  badgeColor: null,
  badgeTextColor: null,
  role: 'visitor' as const,
  receiveEmail: true,
  emailVerified: true,
}

describe('accountRouter.updateProfile', () => {
  beforeEach(() => {
    vi.mocked(findUserById).mockResolvedValue(dbUserStub as unknown as Awaited<ReturnType<typeof findUserById>>)
    vi.mocked(updateUserById).mockResolvedValue(
      updatedUserStub as unknown as Awaited<ReturnType<typeof updateUserById>>,
    )
  })

  it('updates name when supplied and returns the projected user', async () => {
    const ctx = makeAuthedCtx({ userId: '1', role: 'visitor' })
    const res = await call(accountRouter.updateProfile, { name: 'Alice the Updated' }, { context: ctx })
    expect(res.user).toBeDefined()
    expect(vi.mocked(updateUserById)).toHaveBeenCalledWith(1n, expect.objectContaining({ name: 'Alice the Updated' }))
  })

  it('refuses to set badge fields for a non-admin visitor', async () => {
    const ctx = makeAuthedCtx({ userId: '1', role: 'visitor' })
    await call(accountRouter.updateProfile, { badgeName: 'visitor-cannot-set' }, { context: ctx })
    const callPatch = vi.mocked(updateUserById).mock.calls.at(-1)?.[1]
    expect(callPatch).not.toHaveProperty('badgeName')
  })

  it('throws NOT_FOUND when the underlying user row is missing', async () => {
    vi.mocked(findUserById).mockResolvedValueOnce(null)
    const ctx = makeAuthedCtx({ userId: '404' })
    await expect(call(accountRouter.updateProfile, {}, { context: ctx })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<ORPCError<string, unknown>>)
  })
})

describe('accountRouter.updatePassword', () => {
  beforeEach(() => {
    vi.mocked(findUserById).mockResolvedValue(dbUserStub as unknown as Awaited<ReturnType<typeof findUserById>>)
    vi.mocked(updateUserById).mockResolvedValue(
      updatedUserStub as unknown as Awaited<ReturnType<typeof updateUserById>>,
    )
  })

  it('hashes the new password, persists it, and revokes other sessions', async () => {
    const ctx = makeAuthedCtx({ userId: '1', sessionId: 'keep-me' })
    const res = await call(
      accountRouter.updatePassword,
      { oldPassword: 'whatever', newPassword: 'new-password-1' },
      { context: ctx },
    )
    expect(res.success).toBe(true)
    expect(vi.mocked(updateUserById)).toHaveBeenCalledWith(
      1n,
      expect.objectContaining({ password: 'hashed:new-password' }),
    )
    expect(vi.mocked(revokeAllSessionsOfUser)).toHaveBeenCalledWith(1n, 'keep-me')
  })

  it('throws FORBIDDEN when the original password does not match', async () => {
    const bcryptModule = await import('bcryptjs')
    const bcrypt = bcryptModule.default
    vi.mocked(bcrypt.compare as (password: string, hash: string) => Promise<boolean>).mockResolvedValueOnce(false)
    const ctx = makeAuthedCtx({ userId: '1' })
    await expect(
      call(accountRouter.updatePassword, { oldPassword: 'wrong', newPassword: 'new-password-1' }, { context: ctx }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })
})

describe('accountRouter.revokeSession', () => {
  it('returns `currentSession: false` when the revoked id is not the caller session', async () => {
    vi.mocked(revokeSessionById).mockResolvedValue(undefined)
    const ctx = makeAuthedCtx({ userId: '1', sessionId: 'caller-session' })
    const res = await call(accountRouter.revokeSession, { id: 'other-session' }, { context: ctx })
    expect(res).toEqual({ success: true, currentSession: false })
  })
})
