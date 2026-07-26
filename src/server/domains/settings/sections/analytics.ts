import { z } from 'zod'

import { coerceBoolean } from '@/server/domains/settings/sections/shared'

export const analyticsSchema = z.object({
  analytics: z.object({
    trackAdmin: coerceBoolean,
    keepBotRows: coerceBoolean,
  }),
})

export const analyticsDefaults = {
  analytics: { trackAdmin: false, keepBotRows: false },
} as const

export const analyticsSection = {
  scope: 'blog.analytics',
  key: 'analytics',
  schema: analyticsSchema,
  defaults: analyticsDefaults,
} as const
