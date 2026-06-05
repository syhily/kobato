import type { SessionUser } from '@/server/domains/auth/session-storage'

import { ActionFailure, ErrorMessages } from '@/server/infra/http/errors'
import { hasAtLeast, type Role, type RoleOrNull, ROLE_LEVELS } from '@/shared/utils/roles'

// Server-only re-exports for files that already import the role
// primitives via `@/server/domains/auth/rbac`. The isomorphic source of
// truth is `@/shared/utils/roles` — server adds the throwing guards on top.
export { hasAtLeast, ROLE_LEVELS, type Role, type RoleOrNull }

/**
 * Per-request viewer identity. Built once by `defineGuardedApiAction`
 * after `requireRole` has succeeded, then passed verbatim to
 * permission predicates. Carrying viewer instead of `(userId, role)`
 * pairs makes adding fields (e.g. session id) a non-breaking change.
 */
export interface ViewerContext {
  userId: string
  role: Role
}

/**
 * Asserts `user is SessionUser` AND `user.role >= min`. Throws
 * `ActionFailure(403)` otherwise. Use this from `defineGuardedApiAction`
 * and `admin.uploadImage` — anywhere we have a raw `SessionUser | undefined`
 * and want the type system to pick up the narrowed shape on the
 * non-throw path.
 */
export function requireUserRole(user: SessionUser | undefined, min: Role): asserts user is SessionUser {
  if (!user || !hasAtLeast(user.role, min)) {
    throw new ActionFailure(403, ErrorMessages.FORBIDDEN)
  }
}

/**
 * Convenience façade for route loaders: asserts on a `{ user, role }`
 * wrapper so callers can pass `getRouteRequestContext(...)` straight
 * in. Internally delegates to `requireUserRole` so the throw site
 * stays single-source-of-truth.
 */
export function requireRole(
  ctx: { user?: SessionUser; role?: RoleOrNull },
  min: Role,
): asserts ctx is { user: SessionUser; role: Role } {
  requireUserRole(ctx.user, min)
}

// ---------------------------------------------------------------------------
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
// ---------------------------------------------------------------------------

// Factory: build an ownership predicate keyed off a single bigint(-or-null)
// column. `bigint` is assignable to `bigint | null`, so non-null callers
// (e.g. `{ userId: bigint }` for comments) still satisfy the constraint.
function ownerOf<K extends string>(field: K) {
  return <T extends Record<K, bigint | null>>(viewer: ViewerContext, row: T): boolean => {
    const owner = row[field]
    if (owner === null) {
      return false
    }
    return owner.toString() === viewer.userId
  }
}

export const isPostOwner = ownerOf('authorId')
export const isImageOwner = ownerOf('uploaderId')
export const isMusicOwner = ownerOf('uploaderId')
export const isCommentOwner = ownerOf('userId')

export function isAdmin(viewer: { role: Role }): boolean {
  return viewer.role === 'admin'
}

export function canEditPost(viewer: ViewerContext, post: { authorId: bigint | null }): boolean {
  return isAdmin(viewer) || isPostOwner(viewer, post)
}

export function canEditImage(viewer: ViewerContext, img: { uploaderId: bigint | null }): boolean {
  return isAdmin(viewer) || isImageOwner(viewer, img)
}

export function canEditMusic(viewer: ViewerContext, m: { uploaderId: bigint | null }): boolean {
  return isAdmin(viewer) || isMusicOwner(viewer, m)
}

export function canManageComment(viewer: ViewerContext, c: { userId: bigint }): boolean {
  return isAdmin(viewer) || isCommentOwner(viewer, c)
}

// Tag deletion is gated on the global reference count, not on ownership:
// admins may delete any unreferenced tag; non-admins may only delete tags
// no post still lists. See RBAC-REVIEW §4 — note that the live
// `deleteAdminTag` enforces an even stricter fence (refuses ALL deletions
// while any post references the tag, regardless of role) to avoid
// orphaning posts. This predicate captures the design-doc rule for
// future callers; it does NOT relax the service-level guard.
export function canDeleteTag(viewer: ViewerContext, postCount: number): boolean {
  return isAdmin(viewer) || postCount === 0
}
