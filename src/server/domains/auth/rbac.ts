import type { SessionUser } from '@/server/domains/auth/session-storage'

import { ActionFailure, ErrorMessages } from '@/server/infra/http/errors'
import { hasAtLeast, type Role, type RoleOrNull } from '@/shared/utils/roles'

/**
 * Structural minimum a viewer identity must carry for permission
 * predicates; `RequestContext.viewer` satisfies it.
 */
export interface ViewerIdentity {
  id: string
  role: Role
}

/**
 * Asserts `user is SessionUser` AND `user.role >= min`; throws
 * `ActionFailure(403)` otherwise.
 */
export function requireUserRole(user: SessionUser | undefined, min: Role): asserts user is SessionUser {
  if (!user || !hasAtLeast(user.role, min)) {
    throw new ActionFailure(403, ErrorMessages.FORBIDDEN)
  }
}

/**
 * Convenience façade for route loaders: asserts on a `{ user, role }`
 * wrapper; delegates to `requireUserRole`.
 */
export function requireRole(
  ctx: { user?: SessionUser; role?: RoleOrNull },
  min: Role,
): asserts ctx is { user: SessionUser; role: Role } {
  requireUserRole(ctx.user, min)
}

// Two predicate families, kept separate on purpose (RBAC-REVIEW §R1):
// `is{Entity}Owner` — strict ownership, no admin bypass (own-routes);
// `canEdit{Entity}` — admin OR owner (admin surfaces).

// Factory: ownership predicate keyed off one `number | null` column.
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
