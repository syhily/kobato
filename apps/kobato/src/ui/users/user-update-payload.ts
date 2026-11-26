import type { AdminUserUpdateInput } from '@kobato/api/contracts/admin/users'

export type AdminUserUpdatePayload = Omit<AdminUserUpdateInput, 'id'>

export interface UserEditFields {
  name: string
  email: string
  link: string
  badgeName: string
  badgeColor: string
  useTextOverride: boolean
  badgeTextColor: string
}

export function buildUserUpdatePayload(fields: UserEditFields): AdminUserUpdatePayload {
  return {
    name: fields.name,
    email: fields.email,
    link: fields.link || null,
    badgeName: fields.badgeName || null,
    ...(fields.badgeColor ? { badgeColor: fields.badgeColor } : {}),
    badgeTextColor: fields.useTextOverride ? fields.badgeTextColor : null,
  }
}
