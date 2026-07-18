import { z } from 'zod'

import { coerceBoolean } from '@/server/domains/settings/schemas/shared'

export const sidebarSchema = z.object({
  sidebar: z.object({
    widgets: z.array(
      z.object({
        type: z.enum(['search', 'recentPosts', 'recentComments', 'randomTags', 'todayCalendar']),
        enabled: coerceBoolean,
        count: z.coerce.number().int().min(0).max(100).optional(),
      }),
    ),
  }),
})
