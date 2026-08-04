// Isomorphic role primitives. Pure types + functions, no Node deps —
// safe to import from both `server/*` and `ui/*`. The server side
// adds the throwing `requireRole` / `requireUserRole` guards on top
// of these in `@kobato/server/domains/auth/rbac`; UI consumers stick to `Role`,
// `ROLE_LEVELS`, `hasAtLeast`, and `roleLabel`.

export const ROLE_LEVELS = { visitor: 1, author: 2, admin: 3 } as const

export type Role = keyof typeof ROLE_LEVELS

export type RoleOrNull = Role | null

export function hasAtLeast(role: RoleOrNull | undefined, min: Role): boolean {
  if (!role) {
    return false
  }
  return ROLE_LEVELS[role] >= ROLE_LEVELS[min]
}

/**
 * Human-readable Chinese label. Used by both the public chrome
 * (user menu badge) and the admin profile screen. Callers must narrow
 * to a non-null `Role` first — every real call site lives behind a
 * session gate.
 */
export function roleLabel(role: Role): string {
  switch (role) {
    case 'admin':
      return '管理员'
    case 'author':
      return '作者'
    case 'visitor':
      return '访客'
  }
}
