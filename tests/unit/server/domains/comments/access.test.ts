import { describe, expect, it, vi } from 'vitest'

import type { CommentTokenCookie } from '@/shared/utils/comment-token'

vi.mock('@/server/domains/comments/repos/public-query/by-id', () => ({
  findCommentWithUserById: vi.fn(),
}))

vi.mock('@/server/domains/comments/services/token', () => ({
  verifyCommentOwnership: vi.fn(),
}))

import { findCommentWithUserById } from '@/server/domains/comments/repos/public-query/by-id'
import { verifyCommentAccess } from '@/server/domains/comments/services/access'
import { verifyCommentOwnership } from '@/server/domains/comments/services/token'

const cookie: CommentTokenCookie = { version: 1, tokens: {} } as never
const db = {} as never

describe('server/domains/comments/services/access — verifyCommentAccess', () => {
  it('short-circuits as ok for admin sessions', async () => {
    const result = await verifyCommentAccess(db, cookie, '1', { id: '2', role: 'admin' })
    expect(result.ok).toBe(true)
    expect(result.cleaned).toBe(cookie)
    expect(verifyCommentOwnership).not.toHaveBeenCalled()
  })

  it('returns ok when the token proves ownership', async () => {
    vi.mocked(verifyCommentOwnership).mockResolvedValueOnce({ token: 'tok', cleaned: cookie })
    const result = await verifyCommentAccess(db, cookie, '1')
    expect(result.ok).toBe(true)
    expect(findCommentWithUserById).not.toHaveBeenCalled()
  })

  it('falls back to session ownership when token proves nothing', async () => {
    vi.mocked(verifyCommentOwnership).mockResolvedValueOnce({ token: null, cleaned: cookie })
    vi.mocked(findCommentWithUserById).mockResolvedValueOnce({ userId: 42n } as never)
    const result = await verifyCommentAccess(db, cookie, '1', { id: '42', role: 'visitor' })
    expect(result.ok).toBe(true)
  })

  it('returns ok=false when session id does not match the comment author', async () => {
    vi.mocked(verifyCommentOwnership).mockResolvedValueOnce({ token: null, cleaned: cookie })
    vi.mocked(findCommentWithUserById).mockResolvedValueOnce({ userId: 99n } as never)
    const result = await verifyCommentAccess(db, cookie, '1', { id: '42', role: 'visitor' })
    expect(result.ok).toBe(false)
  })

  it('returns ok=false when there is no session and no token ownership', async () => {
    vi.mocked(verifyCommentOwnership).mockResolvedValueOnce({ token: null, cleaned: cookie })
    const result = await verifyCommentAccess(db, cookie, '1')
    expect(result.ok).toBe(false)
  })

  it('returns ok=false when the comment does not exist', async () => {
    vi.mocked(verifyCommentOwnership).mockResolvedValueOnce({ token: null, cleaned: cookie })
    vi.mocked(findCommentWithUserById).mockResolvedValueOnce(null as never)
    const result = await verifyCommentAccess(db, cookie, '1', { id: '42', role: 'visitor' })
    expect(result.ok).toBe(false)
  })
})
