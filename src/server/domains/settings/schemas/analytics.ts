import { z } from 'zod'

import { coerceBoolean } from '@/server/domains/settings/schemas/shared'

export const analyticsSchema = z.object({
  analytics: z.object({
    trackAdmin: coerceBoolean,
    keepBotRows: coerceBoolean,
  }),
})
