import { z } from 'zod'

import type { Assert, Equals } from '@/shared/contracts/primitives'
import type { AdminUserDto } from '@/shared/types/users'

import { idString, isoDateTime } from '@/shared/contracts/primitives'

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
})

// ─── parity assertion ──────────────────────────────────
type _adminUserDtoParity = Assert<Equals<z.infer<typeof adminUserDto>, AdminUserDto>>
