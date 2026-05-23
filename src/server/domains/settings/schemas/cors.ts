import { z } from 'zod'

import { coerceBoolean } from '@/server/domains/settings/schemas/shared'

export const corsSchema = z.object({
  cors: z.object({
    enabled: coerceBoolean,
    origins: z.array(z.string().trim().min(1).max(253)).max(20).default([]),
  }),
})
export type CorsInput = z.infer<typeof corsSchema>
