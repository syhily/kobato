import { idString, isoDateTime } from '@kobato/contracts/primitives.ts'
import { z } from 'zod'

// Per-user signin method: `password` default, `magic-link` (needs a ready
// mail transport), `passkey` (needs a registered passkey + global switch).
export const LOGIN_METHODS = ['password', 'magic-link', 'passkey'] as const
export const loginMethodSchema = z.enum(LOGIN_METHODS)
export type LoginMethod = z.infer<typeof loginMethodSchema>

export const adminUserDto = z.object({
  id: idString,
  name: z.string(),
  email: z.string(),
  link: z.string().nullable(),
  badgeName: z.string().nullable(),
  badgeColor: z.string().nullable(),
  badgeTextColor: z.string().nullable(),
  role: z.enum(['admin', 'author', 'visitor']).nullable(),
  isMuted: z.boolean(),
  emailVerified: z.boolean(),
  createdAt: isoDateTime,
  deletedAt: isoDateTime.nullable(),
  commentCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
  lastCommentAt: isoDateTime.nullable(),
  passkeyCount: z.number().int().nonnegative(),
  loginMethod: loginMethodSchema,
})
export type AdminUserDto = z.infer<typeof adminUserDto>

// Self-service profile projection; a missing row degrades to empty fields.
export interface AccountProfile {
  id: string
  name: string
  email: string
  link: string
  role: 'admin' | 'author' | 'visitor' | null
  badgeName: string
  badgeColor: string
  createdAt: string | null
  lastIp: string | null
  lastUa: string | null
  loginMethod: LoginMethod
}
