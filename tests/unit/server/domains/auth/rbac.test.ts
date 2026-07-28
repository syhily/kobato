import { describe, expect, expectTypeOf, it } from 'vitest'

import type { SessionUser } from '@/server/domains/auth/session-storage'

import {
  canEditImage,
  canEditMusic,
  canEditPost,
  isAdmin,
  isCommentOwner,
  isImageOwner,
  isMusicOwner,
  isPostOwner,
  requireRole,
  requireUserRole,
  type ViewerIdentity,
} from '@/server/domains/auth/rbac'
import { ActionFailure } from '@/server/infra/http/errors'

function viewer(role: 'admin' | 'author' | 'visitor', id = '1'): ViewerIdentity {
  return { id, role }
}

function sessionUser(role: 'admin' | 'author' | 'visitor'): SessionUser {
  return { id: '1', role, name: 'tester', email: 't@example.com', website: null } as unknown as SessionUser
}

describe('server/domains/auth/rbac — requireUserRole', () => {
  it('passes through when user meets the minimum role', () => {
    expect(() => requireUserRole(sessionUser('admin'), 'admin')).not.toThrow()
    expect(() => requireUserRole(sessionUser('author'), 'visitor')).not.toThrow()
  })

  it('throws ActionFailure(403) when user is missing', () => {
    expect(() => requireUserRole(undefined, 'visitor')).toThrow(ActionFailure)
  })

  it('throws ActionFailure(403) when user role is below minimum', () => {
    try {
      requireUserRole(sessionUser('visitor'), 'admin')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(ActionFailure)
      expect((e as ActionFailure).status).toBe(403)
    }
  })

  it('narrows the type on the non-throw path', () => {
    const u: SessionUser | undefined = sessionUser('admin')
    requireUserRole(u, 'admin')
    expectTypeOf(u).toMatchTypeOf<SessionUser>()
  })
})

describe('server/domains/auth/rbac — requireRole', () => {
  it('delegates to requireUserRole and throws when forbidden', () => {
    expect(() => requireRole({ role: 'visitor' }, 'admin')).toThrow(ActionFailure)
    expect(() => requireRole({ user: sessionUser('admin'), role: 'admin' }, 'admin')).not.toThrow()
  })
})

describe('server/domains/auth/rbac — ownerOf family', () => {
  it('isPostOwner matches the authorId column', () => {
    expect(isPostOwner(viewer('author', '5'), { authorId: 5 })).toBe(true)
    expect(isPostOwner(viewer('author', '5'), { authorId: 6 })).toBe(false)
  })

  it('isImageOwner matches the uploaderId column', () => {
    expect(isImageOwner(viewer('author', '5'), { uploaderId: 5 })).toBe(true)
    expect(isImageOwner(viewer('author', '5'), { uploaderId: null })).toBe(false)
  })

  it('isMusicOwner matches the uploaderId column', () => {
    expect(isMusicOwner(viewer('author', '5'), { uploaderId: 5 })).toBe(true)
  })

  it('isCommentOwner matches the userId column', () => {
    expect(isCommentOwner(viewer('visitor', '5'), { userId: 5 })).toBe(true)
    expect(isCommentOwner(viewer('visitor', '5'), { userId: 6 })).toBe(false)
  })

  it('treats null ownerId as never the viewer', () => {
    expect(isPostOwner(viewer('admin', '1'), { authorId: null })).toBe(false)
  })
})

describe('server/domains/auth/rbac — isAdmin', () => {
  it('returns true only for the admin role', () => {
    expect(isAdmin(viewer('admin'))).toBe(true)
    expect(isAdmin(viewer('author'))).toBe(false)
    expect(isAdmin(viewer('visitor'))).toBe(false)
  })
})

describe('server/domains/auth/rbac — canEditX family (admin or owner)', () => {
  it('canEditPost lets admin act on anyone', () => {
    expect(canEditPost(viewer('admin', '1'), { authorId: 99 })).toBe(true)
  })

  it('canEditPost lets the author act on their own row', () => {
    expect(canEditPost(viewer('author', '5'), { authorId: 5 })).toBe(true)
  })

  it('canEditPost blocks other authors', () => {
    expect(canEditPost(viewer('author', '5'), { authorId: 6 })).toBe(false)
  })

  it('canEditImage and canEditMusic behave symmetrically', () => {
    expect(canEditImage(viewer('admin'), { uploaderId: 7 })).toBe(true)
    expect(canEditMusic(viewer('author', '7'), { uploaderId: 7 })).toBe(true)
    expect(canEditImage(viewer('visitor', '7'), { uploaderId: 7 })).toBe(true)
    expect(canEditMusic(viewer('visitor', '7'), { uploaderId: 8 })).toBe(false)
  })
})
