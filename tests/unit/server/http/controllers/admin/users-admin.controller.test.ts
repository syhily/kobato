import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { parseRpcJson } from '#/_helpers/rpc-call'

const fetchAdminUserDto = vi.hoisted(() => vi.fn())
const muteAdminUser = vi.hoisted(() => vi.fn())
const updateUserRoleWithGuard = vi.hoisted(() => vi.fn())
const inviteAuthorWithRollback = vi.hoisted(() => vi.fn())
const sendPasswordResetToUser = vi.hoisted(() => vi.fn())
const deleteAllCredentials = vi.hoisted(() => vi.fn())

vi.mock('@/server/domains/users/services/admin', () => ({
  fetchAdminUserDto,
  muteAdminUser,
  updateUserRoleWithGuard,
  inviteAuthorWithRollback,
  sendPasswordResetToUser,
}))

vi.mock('@/server/domains/audit/services/record', () => ({
  recordAuditEventFromContext: vi.fn(),
}))

vi.mock('@/server/domains/auth/passkey-gate', () => ({
  isPasskeyEnabled: vi.fn(() => true),
}))

vi.mock('@/server/domains/auth/passkey-service', () => ({
  deleteAllCredentials,
}))

vi.mock('@/server/infra/rate-limit', () => ({
  tryInviteRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
  tryInviteByEmailRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
}))

vi.mock('@/shared/config/getters', () => ({
  getBlogSettingsBundleSync: vi.fn(() => ({ siteIdentity: { website: 'https://example.com' } })),
}))

const { RPCHandler } = await import('@orpc/server/fetch')
const { adminUsersAdminRouter } = await import('@/server/http/controllers/admin/users-admin.controller')
const handler = new RPCHandler(adminUsersAdminRouter)

async function call(path: string, input: unknown) {
  const result = await handler.handle(
    new Request(`http://localhost/rpc${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: input }),
    }),
    { prefix: '/rpc', context: makeAuthedCtx({ role: 'admin' }) },
  )
  if (!result.matched) {
    throw new Error(`No route matched for ${path}`)
  }
  return result.response
}

describe('admin users-admin controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchAdminUserDto.mockResolvedValue({
      id: '1',
      name: 'Alice',
      email: 'alice@example.com',
      link: null,
      badgeName: null,
      badgeColor: null,
      badgeTextColor: null,
      role: 'author',
      isMuted: false,
      emailVerified: true,
      createdAt: new Date().toISOString(),
      deletedAt: null,
      commentCount: 0,
      pendingCount: 0,
      lastCommentAt: null,
      passkeyCount: 0,
      passkeyForce: false,
    })
    muteAdminUser.mockResolvedValue({ id: 1n })
    updateUserRoleWithGuard.mockResolvedValue({ role: 'visitor' })
    inviteAuthorWithRollback.mockResolvedValue({ userId: 2n })
    sendPasswordResetToUser.mockResolvedValue({ userId: 3n })
  })

  it('mutes a user', async () => {
    const response = await call('/mute', { id: '1', muted: true })
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{ user: unknown }>(response)
    expect(body.user).toBeDefined()
    expect(muteAdminUser).toHaveBeenCalledWith(expect.anything(), 1n, true)
  })

  it('returns 404 when muting a non-existent user', async () => {
    muteAdminUser.mockResolvedValue(null)
    const response = await call('/mute', { id: '1', muted: true })
    expect(response.status).toBe(404)
  })

  it('updates a user role', async () => {
    const response = await call('/updateRole', { id: '1', role: 'visitor' })
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{ user: unknown }>(response)
    expect(body.user).toBeDefined()
    expect(updateUserRoleWithGuard).toHaveBeenCalledWith(expect.anything(), 1n, 'visitor', '1')
  })

  it('invites an author', async () => {
    const response = await call('/inviteAuthor', { email: 'bob@example.com', name: 'Bob' })
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{ success: boolean }>(response)
    expect(body.success).toBe(true)
  })

  it('rejects an invite when rate limited', async () => {
    const { tryInviteRateLimit } = await import('@/server/infra/rate-limit')
    ;(tryInviteRateLimit as ReturnType<typeof vi.fn>).mockResolvedValue({ exceeded: true })
    const response = await call('/inviteAuthor', { email: 'bob@example.com', name: 'Bob' })
    expect(response.status).toBe(429)
  })

  it('sends a password reset', async () => {
    const response = await call('/sendPasswordReset', { email: 'alice@example.com' })
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{ success: boolean }>(response)
    expect(body.success).toBe(true)
  })

  it('clears passkeys for a user', async () => {
    const response = await call('/clearPasskeys', { id: '1' })
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{ user: unknown }>(response)
    expect(body.user).toBeDefined()
    // Force clearing is owned by deleteAllCredentials itself (service-level
    // invariant, covered in passkey-service.test.ts).
    expect(deleteAllCredentials).toHaveBeenCalledWith(expect.anything(), 1n)
  })
})
