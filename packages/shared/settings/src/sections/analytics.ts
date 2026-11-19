import { coerceBoolean } from '@kobato/settings/sections/shared.ts'
import { z } from 'zod'

export const analyticsSchema = z.object({
  analytics: z.object({
    trackAdmin: coerceBoolean,
    keepBotRows: coerceBoolean,
    geoipAutoUpdate: coerceBoolean.default(true),
  }),
})

export const analyticsDefaults = {
  analytics: { trackAdmin: false, keepBotRows: false, geoipAutoUpdate: true },
} as const

export const analyticsSection = {
  scope: 'blog.analytics',
  key: 'analytics',
  schema: analyticsSchema,
  defaults: analyticsDefaults,
} as const
