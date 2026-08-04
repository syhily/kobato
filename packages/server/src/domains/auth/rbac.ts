import type { SessionUser } from '@kobato/server/domains/auth/session-storage'

import { ActionFailure, ErrorMessages } from '@kobato/server/infra/http/errors'
import { hasAtLeast, type Role, type RoleOrNull } from '@kobato/shared/utils/roles'

/**
 * The structural minimum a viewer identity must carry for permission
 * predicates. The canonical `RequestContext.viewer` (a full `SessionUser`,
 * see `@kobato/server/http/request-context`) satisfies it; tests can stub the
 * two fields directly.
 */
export interface ViewerIdentity {
  id: string
  role: Role
}

/**
 * Asserts `user is SessionUser` AND `user.role >= min`. Throws
 * `ActionFailure(403)` otherwise. Use anywhere we have a raw
 * `SessionUser | undefined` and want the type system to pick up the
 * narrowed shape on the non-throw path.
 */
export function requireUserRole(user: SessionUser | undefined, min: Role): asserts user is SessionUser {
  if (!user || !hasAtLeast(user.role, min)) {
    throw new ActionFailure(403, ErrorMessages.FORBIDDEN)
  }
}

/**
 * Convenience façade for route loaders: asserts on a `{ user, role }`
 * wrapper so callers can pass a projection of the canonical
 * `RequestContext` straight in. Internally delegates to `requireUserRole`
 * so the throw site stays single-source-of-truth.
 */
export function requireRole(
  ctx: { user?: SessionUser; role?: RoleOrNull },
  min: Role,
): asserts ctx is { user: SessionUser; role: Role } {
  requireUserRole(ctx.user, min)
}

// Permission predicates
//
// Two families:
//
//  - `is{Entity}Owner(viewer, row)`: strict ownership, no admin bypass.
//    Use these on the "own-routes" — endpoints whose semantics are
//    explicitly "act as the owner" (`comment.updateOwn`, etc.). An admin
//    using these would log misleading audit trails AND get stuck on
//    DB-level WHERE clauses that further require `requested_by = viewer`.
//
//  - `canEdit{Entity}(viewer, row)`: admin OR owner. Use these on admin
//    surfaces where an admin is legitimately allowed to act on someone
//    else's row (admin posts/images/music management screens).
//
// Keeping the two families separate avoids the "for-the-sake-of-DRY"
// trap of collapsing them into one — see RBAC-REVIEW §R1.

// Factory: build an ownership predicate keyed off a single bigint(-or-null)
// column. `bigint` is assignable to `number | null`, so non-null callers
// (e.g. `{ userId: number }` for comments) still satisfy the constraint.
function ownerOf<K extends string>(field: K) {
  return <T extends Record<K, number | null>>(viewer: ViewerIdentity, row: T): boolean => {
    const owner = row[field]
    if (owner === null) {
      return false
    }
    return owner.toString() === viewer.id
  }
}

export const isPostOwner = ownerOf('authorId')
export const isImageOwner = ownerOf('uploaderId')
export const isMusicOwner = ownerOf('uploaderId')
export const isCommentOwner = ownerOf('userId')

export function isAdmin(viewer: { role: Role }): boolean {
  return viewer.role === 'admin'
}

export function canEditPost(viewer: ViewerIdentity, post: { authorId: number | null }): boolean {
  return isAdmin(viewer) || isPostOwner(viewer, post)
}

export function canEditImage(viewer: ViewerIdentity, img: { uploaderId: number | null }): boolean {
  return isAdmin(viewer) || isImageOwner(viewer, img)
}

export function canEditMusic(viewer: ViewerIdentity, m: { uploaderId: number | null }): boolean {
  return isAdmin(viewer) || isMusicOwner(viewer, m)
}
