import { z } from 'zod'

import { coerceBoolean } from '@/server/domains/settings/schemas/shared'

export const newsletterSchema = z.object({
  newsletter: z.object({
    enabled: coerceBoolean.default(false),
    fromName: z.string().trim().max(80).default(''),
    subjectPrefix: z.string().trim().max(80).default(''),
  }),
})
