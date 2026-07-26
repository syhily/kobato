// Payload assembly for the admin user-edit form. Optional profile fields
// (link / badge) are only sent when non-empty so the server keeps the stored
// value; `badgeTextColor` is sent as `null` unless the text-color override is
// on, making the server fall back to the automatic contrast color.

export interface UserEditFields {
  name: string
  email: string
  link: string
  badgeName: string
  badgeColor: string
  useTextOverride: boolean
  badgeTextColor: string
}

export function buildUserUpdatePayload(fields: UserEditFields): Record<string, string | null> {
  const payload: Record<string, string | null> = { name: fields.name, email: fields.email }
  if (fields.link) {
    payload.link = fields.link
  }
  if (fields.badgeName) {
    payload.badgeName = fields.badgeName
  }
  if (fields.badgeColor) {
    payload.badgeColor = fields.badgeColor
  }
  payload.badgeTextColor = fields.useTextOverride ? fields.badgeTextColor : null
  return payload
}
