import { z } from 'zod'

import { idString, isoDateTime } from '@/shared/contracts/primitives'

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
