import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

export const ROLE_LEVELS = { visitor: 1, author: 2, admin: 3 } as const

export type Role = keyof typeof ROLE_LEVELS

export type RoleOrNull = Role | null

export function hasAtLeast(role: RoleOrNull | undefined, min: Role): boolean {
  if (!role) {
    return false
  }
  return ROLE_LEVELS[role] >= ROLE_LEVELS[min]
}

export const ROLE_LABEL_KEYS = {
  admin: 'common.role.admin',
  author: 'common.role.author',
  visitor: 'common.role.visitor',
} as const satisfies Record<Role, UiMessageId>
