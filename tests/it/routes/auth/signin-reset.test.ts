import { beforeEach, describe, expect, it, vi } from 'vitest'

// Covers RBAC-RECTIFICATION-PLAN §1.2.
//
// The `signin` action's password-reset and author-invite branches
// share a non-negotiable invariant:
//
//   After a successful password rotation, ALL other sessions of the
//   target user MUST be revoked — `establishLoginSession` is called
//   with `{ revokeOtherSessions: true }` so a stolen cookie cannot
//   survive the recovery flow.
//
// We exercise the action with scenarios that pin this invariant in place.

const state = vi.hoisted(() => {
  const store = new Map<string, unknown>()
  return {
    session: {
      get(key: string) {
        return store.get(key)
      },
      set(key: string, value: unknown) {
        store.set(key, value)
      },
      unset(key: string) {
        store.delete(key)
      },
    },
  }
})

const sessionMocks = vi.hoisted(() => ({
  commitSession: vi.fn(async () => 'blog_session=stub'),
  destroySession: vi.fn(async () => 'blog_session=deleted'),
}))

// The route module imports each helper from its original location.
// Mocking the `@/server/session` re-export does nothing — Vitest only
// catches the import at the path the consumer actually used.

vi.mock('@/server/domains/auth/session-storage', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/auth/session-storage')>(
    '@/server/domains/auth/session-storage',
  )
  return {
    ...actual,
    commitSession: sessionMocks.commitSession,
    destroySession: sessionMocks.destroySession,
  }
})

vi.mock('@/server/domains/auth/context', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/auth/context')>('@/server/domains/auth/context')
  return {
    ...actual,
    getRouteRequestContext: vi.fn(({ request }: { request: Request }) => ({
      session: state.session,
      user: undefined,
      role: null,
      clientAddress: '203.0.113.7',
      url: new URL(request.url),
    })),
    getDbFromContext: vi.fn(() => ({})),
    getPoolFromContext: vi.fn(() => ({})),
  }
})

vi.mock('@/server/domains/auth/flows', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/auth/flows')>('@/server/domains/auth/flows')
  return {
    ...actual,
  }
})

vi.mock('@/server/domains/settings/install-gate', () => ({
  ensureInstalledOrRedirect: vi.fn(async () => null),
  ensureNoAdminOrRedirect: vi.fn(async () => null),
  isInstalled: vi.fn(async () => true),
  getInstallState: vi.fn(async () => 'installed' as const),
}))

const authPrimitivesMocks = vi.hoisted(() => ({
  establishLoginSession: vi.fn(async () => undefined),
  logout: vi.fn(async () => undefined),
  login: vi.fn(async () => undefined),
}))

vi.mock('@/server/domains/auth/primitives', async () => {
  const actual = await vi.importActual<typeof import('@/server/domains/auth/primitives')>(
    '@/server/domains/auth/primitives',
  )
  return {
    ...actual,
    establishLoginSession: authPrimitivesMocks.establishLoginSession,
    logout: authPrimitivesMocks.logout,
    login: authPrimitivesMocks.login,
  }
})

const tokenMocks = vi.hoisted(() => ({
  consumeToken: vi.fn(),
  peekToken: vi.fn(async () => null),
  issueResetToken: vi.fn(async () => ({ token: 'tok-test' })),
}))

vi.mock('@/server/domains/auth/verification-tokens', () => tokenMocks)

const userQueryMocks = vi.hoisted(() => ({
  findUserById: vi.fn(),
  updateUserById: vi.fn(async () => ({ id: 42n })),
  findUserByEmail: vi.fn(async () => null),
}))

vi.mock('@/server/infra/db/operations/user', () => userQueryMocks)

vi.mock('@/server/domains/comments/repos/query', () => ({
  countApprovedCommentsByUser: vi.fn(async () => 0),
}))

vi.mock('@/server/infra/email/sender', () => ({
  sendPasswordReset: vi.fn(async () => undefined),
}))

vi.mock('@/server/domains/auth/csrf', () => ({
  validateCsrfForAction: vi.fn(() => true),
}))

vi.mock('@/server/infra/rate-limit', () => ({
  tryPasswordResetRateLimit: vi.fn(async () => ({ count: 1, exceeded: false })),
  tryPasswordResetByEmailRateLimit: vi.fn(async () => ({ count: 1, exceeded: false })),
}))

const { action } = await import('@/routes/auth/signin')

function resetRequest(body: Record<string, string>): Request {
  return new Request('http://localhost/admin/signin?action=resetpassword', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  tokenMocks.consumeToken.mockResolvedValue(null)
  userQueryMocks.findUserById.mockResolvedValue(null)
})

async function readActionData<T>(promise: Promise<unknown>): Promise<T> {
  const result = (await promise) as { data: T } | T
  if (result !== null && typeof result === 'object' && 'data' in (result as object)) {
    return (result as { data: T }).data
  }
  return result as T
}

describe('routes/signin — password-reset session-revocation', () => {
  it('returns 链接无效或已过期 when consumeToken yields null (no session established)', async () => {
    tokenMocks.consumeToken.mockResolvedValueOnce(null)
    const result = await readActionData<{ error: string | null }>(
      action({
        request: resetRequest({ reset_token: 'rt', password: 'LongEnough1' }),
      } as unknown as Parameters<typeof action>[0]),
    )
    expect(result.error).toBe('链接无效或已过期。')
    expect(authPrimitivesMocks.establishLoginSession).not.toHaveBeenCalled()
  })

  it('calls establishLoginSession with revokeOtherSessions: true on a successful reset', async () => {
    tokenMocks.consumeToken.mockResolvedValueOnce({ userId: 42n })
    userQueryMocks.findUserById.mockResolvedValueOnce({
      id: 42n,
      role: 'visitor',
      name: 'tester',
      email: 'tester@example.com',
      password: 'hash',
    })

    // Action returns a redirect Response on success; both `data(...)` and
    // `redirect(...)` flow through the same call surface.
    let caught: unknown
    try {
      await action({
        request: resetRequest({ reset_token: 'rt', password: 'LongEnough1' }),
      } as unknown as Parameters<typeof action>[0])
    } catch (error) {
      caught = error
    }
    // Whichever path it took, the security invariant is the same:
    expect(authPrimitivesMocks.establishLoginSession).toHaveBeenCalledTimes(1)
    const callArgs = authPrimitivesMocks.establishLoginSession.mock.calls[0]!
    // Last positional arg is `{ revokeOtherSessions: true }`.
    expect(callArgs[callArgs.length - 1]).toEqual({ revokeOtherSessions: true })
    // Make TS happy about the unused capture.
    void caught
  })
})
