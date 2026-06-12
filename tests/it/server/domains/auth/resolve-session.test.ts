import { createSession } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUserById = vi.fn()
const recordSessionActivity = vi.fn()
const getRequestSession = vi.fn()

vi.mock('@/server/domains/auth/session-storage', () => ({
  getRequestSession,
}))

vi.mock('@/server/infra/db/operations/user', () => ({
  findUserById,
}))

vi.mock('@/server/domains/auth/repo', () => ({
  recordSessionActivity,
}))

vi.mock('@/server/infra/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/infra/logger')>()
  return {
    ...actual,
    getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  }
})

describe('auth/primitives — resolveSessionContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns dirty=true when upgrading a legacy session without role', async () => {
    const legacyUser = { id: '1', name: 'legacy', email: 'legacy@example.com', website: null }
    const session = createSession({ user: legacyUser }, 'test-sid')

    getRequestSession.mockResolvedValueOnce(session)
    findUserById.mockResolvedValueOnce({
      id: 1n,
      name: 'legacy',
      email: 'legacy@example.com',
      link: null,
      role: 'admin',
    })

    const { resolveSessionContext } = await import('@/server/domains/auth/primitives')
    const result = await resolveSessionContext({} as any, new Request('http://localhost/'))

    expect(result.dirty).toBe(true)
    expect(result.user).toEqual({
      id: '1',
      name: 'legacy',
      email: 'legacy@example.com',
      website: null,
      role: 'admin',
    })
    expect(session.get('user')).toEqual(result.user)
  })

  it('returns dirty=true when clearing a legacy session for a demoted/gone user', async () => {
    const legacyUser = { id: '1', name: 'legacy', email: 'legacy@example.com', website: null }
    const session = createSession({ user: legacyUser }, 'test-sid')

    getRequestSession.mockResolvedValueOnce(session)
    findUserById.mockResolvedValueOnce(null)

    const { resolveSessionContext } = await import('@/server/domains/auth/primitives')
    const result = await resolveSessionContext({} as any, new Request('http://localhost/'))

    expect(result.dirty).toBe(true)
    expect(result.user).toBeUndefined()
    expect(session.get('user')).toBeUndefined()
  })

  it('returns dirty=false for a modern session that already has role', async () => {
    const modernUser = { id: '1', name: 'modern', email: 'modern@example.com', website: null, role: 'admin' }
    const session = createSession({ user: modernUser }, 'test-sid')

    getRequestSession.mockResolvedValueOnce(session)

    const { resolveSessionContext } = await import('@/server/domains/auth/primitives')
    const result = await resolveSessionContext({} as any, new Request('http://localhost/'))

    expect(result.dirty).toBe(false)
    expect(result.user).toEqual(modernUser)
    expect(findUserById).not.toHaveBeenCalled()
  })

  it('returns dirty=true and clears user when findUserById throws', async () => {
    const legacyUser = { id: '1', name: 'legacy', email: 'legacy@example.com', website: null }
    const session = createSession({ user: legacyUser }, 'test-sid')

    getRequestSession.mockResolvedValueOnce(session)
    findUserById.mockRejectedValueOnce(new Error('connection lost'))

    const { resolveSessionContext } = await import('@/server/domains/auth/primitives')
    const result = await resolveSessionContext({} as any, new Request('http://localhost/'))

    expect(result.dirty).toBe(true)
    expect(result.user).toBeUndefined()
    expect(session.get('user')).toBeUndefined()
  })

  it('returns dirty=false for an anonymous request', async () => {
    const session = createSession({}, 'test-sid')

    getRequestSession.mockResolvedValueOnce(session)

    const { resolveSessionContext } = await import('@/server/domains/auth/primitives')
    const result = await resolveSessionContext({} as any, new Request('http://localhost/'))

    expect(result.dirty).toBe(false)
    expect(result.user).toBeUndefined()
    expect(findUserById).not.toHaveBeenCalled()
  })
})
