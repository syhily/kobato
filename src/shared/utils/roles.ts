// Isomorphic role primitives (no Node deps). The server adds the
// throwing `requireRole` / `requireUserRole` guards in
// `@/server/domains/auth/rbac`; UI consumers stick to `Role` + helpers.

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
 * Message ids for the role names — the localized surface public UI reads.
 * `roleLabel` below is the pre-i18n admin label, retired in the admin slice.
 */
export const ROLE_LABEL_KEYS = {
  admin: 'common.role.admin',
  author: 'common.role.author',
  visitor: 'common.role.visitor',
} as const

/** Human-readable Chinese label; callers must narrow to a non-null `Role` first (every call site sits behind a session gate). */
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
