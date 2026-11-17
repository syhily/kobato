import type { AdminUserUpdateInput } from '@kobato/shared/contracts/admin.ts'

// The admin user-update wire input now derives from the shared merge-patch
// contract (`adminUserUpdateInput`) instead of the server router: the form and
// the server validate against the same schema, so a rejected shape is a
// compile error here, not a runtime 400 for the user.
export type AdminUserUpdatePayload = Omit<AdminUserUpdateInput, 'id'>

// Payload assembly for the admin user-edit form: the form is the full editor,
// so an emptied optional field is sent as a literal `null` to clear the stored
// value (an absent key would leave it untouched); `badgeTextColor` is `null`
// unless the text-color override is on, falling back to auto contrast.
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
