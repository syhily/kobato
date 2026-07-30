import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { parseRpcJson } from '#/_helpers/rpc-call'

const fetchAdminUserDto = vi.hoisted(() => vi.fn())
const muteUser = vi.hoisted(() => vi.fn())
const updateUserRoleWithGuard = vi.hoisted(() => vi.fn())
const inviteAuthorWithRollback = vi.hoisted(() => vi.fn())
const sendPasswordResetToUser = vi.hoisted(() => vi.fn())
const deleteAllCredentials = vi.hoisted(() => vi.fn())

vi.mock('@/server/domains/users/services/admin', () => ({
  fetchAdminUserDto,
  muteUser,
  updateUserRoleWithGuard,
  inviteAuthorWithRollback,
  sendPasswordResetToUser,
}))

vi.mock('@/server/domains/audit/services/record', () => ({
  recordAuditEventFromContext: vi.fn(),
}))

vi.mock('@/server/domains/auth/passkey/gate', () => ({
  isPasskeyEnabled: vi.fn(() => true),
}))

vi.mock('@/server/domains/auth/passkey/service', () => ({
  deleteAllCredentials,
}))

const { RPCHandler } = await import('@orpc/server/fetch')
const { adminUsersAdminRouter } = await import('@/server/http/controllers/admin/users-admin.controller')
const { __resetRateLimitsForTests } = await import('@/server/infra/rate-limit')
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

function makeAdminUserDto() {
  return {
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
    loginMethod: 'password' as const,
  }
}

describe('admin users-admin controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __resetRateLimitsForTests()
    fetchAdminUserDto.mockResolvedValue(makeAdminUserDto())
    muteUser.mockResolvedValue(makeAdminUserDto())
    updateUserRoleWithGuard.mockResolvedValue({ role: 'visitor' })
    inviteAuthorWithRollback.mockResolvedValue({ userId: 2 })
    sendPasswordResetToUser.mockResolvedValue({ userId: 3 })
  })

  it('mutes a user', async () => {
    const response = await call('/mute', { id: '1', muted: true })
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{ user: unknown }>(response)
    expect(body.user).toBeDefined()
    expect(muteUser).toHaveBeenCalledWith(expect.anything(), 1, true)
  })

  it('returns 404 when muting a non-existent user or an admin', async () => {
    const { DomainError } = await import('@/server/infra/http/errors')
    muteUser.mockRejectedValue(new DomainError('NOT_FOUND', '用户不存在或为管理员（管理员不可禁言）'))
    const response = await call('/mute', { id: '1', muted: true })
    expect(response.status).toBe(404)
  })

  it('updates a user role', async () => {
    const response = await call('/updateRole', { id: '1', role: 'visitor' })
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{ user: unknown }>(response)
    expect(body.user).toBeDefined()
    expect(updateUserRoleWithGuard).toHaveBeenCalledWith(expect.anything(), 1, 'visitor', '1')
  })

  it('invites an author', async () => {
    const response = await call('/inviteAuthor', { email: 'bob@example.com', name: 'Bob' })
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{ success: boolean }>(response)
    expect(body.success).toBe(true)
    // The site origin comes from the settings bundle via resolveSiteOrigin.
    expect(inviteAuthorWithRollback).toHaveBeenCalledWith(
      expect.anything(),
      'Bob',
      'bob@example.com',
      'https://example.com',
      'Test User',
      'test@example.com',
    )
  })

  it('rejects an invite when rate limited', async () => {
    // Shrink the per-IP invite bucket so the second invite in the window
    // trips; keep the per-email bucket out of the way so the 429 is
    // attributable to the IP guard.
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      rateLimit: {
        ...TEST_BLOG_SETTINGS_BUNDLE.rateLimit!,
        inviteIp: { windowSeconds: 60, maxAttempts: 1 },
        inviteEmail: { windowSeconds: 60, maxAttempts: 100 },
      },
    })
    expect((await call('/inviteAuthor', { email: 'bob@example.com', name: 'Bob' })).status).toBe(200)

    const response = await call('/inviteAuthor', { email: 'bob@example.com', name: 'Bob' })
    expect(response.status).toBe(429)
  })

  it('sends a password reset', async () => {
    const response = await call('/sendPasswordReset', { email: 'alice@example.com' })
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{ success: boolean }>(response)
    expect(body.success).toBe(true)
    expect(sendPasswordResetToUser).toHaveBeenCalledWith(expect.anything(), 'alice@example.com', 'https://example.com')
  })

  it('clears passkeys for a user', async () => {
    const response = await call('/clearPasskeys', { id: '1' })
    expect(response.status).toBe(200)
    const body = await parseRpcJson<{ user: unknown }>(response)
    expect(body.user).toBeDefined()
    // Force clearing is owned by deleteAllCredentials itself (service-level
    // invariant, covered in passkey/service.test.ts).
    expect(deleteAllCredentials).toHaveBeenCalledWith(expect.anything(), 1)
  })
})
