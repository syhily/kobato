import { z } from 'zod'

import { userSortOrders } from '@/shared/types/users'

// Schemas for the admin user-management Resource Routes. Kept separate
// from the comment schemas so the public bundle never reaches them and
// the file stays a single source of truth for the admin contract.

// Supported sort orders for the admin user list. `recent` keeps the
// historical default (newest accounts first); `commentCount` sorts by
// the aggregated comment count desc so the most active commenters
// surface to the top — useful for triage.
export const listUsersSchema = z.object({
  offset: z.coerce.number().min(0).default(0),
  limit: z.coerce.number().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  role: z.enum(['all', 'admin', 'normal']).default('all').optional(),
  includeDeleted: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  sortBy: z.enum(userSortOrders).default('recent').optional(),
  hasPosts: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  hasPages: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
})

export const userIdSchema = z.object({
  userId: z.string().min(1),
})

export const muteUserSchema = z.object({
  userId: z.string().min(1),
  muted: z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]),
})
