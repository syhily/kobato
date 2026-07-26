import { z } from 'zod'

import { coerceBoolean } from '@/server/domains/settings/sections/shared'

export const newsletterSchema = z.object({
  newsletter: z.object({
    enabled: coerceBoolean.default(false),
    fromName: z.string().trim().max(80).default(''),
    subjectPrefix: z.string().trim().max(80).default(''),
  }),
})

export const newsletterDefaults = {
  newsletter: { enabled: false, fromName: '', subjectPrefix: '' },
} as const

export const newsletterSection = {
  scope: 'blog.newsletter',
  key: 'newsletter',
  schema: newsletterSchema,
  defaults: newsletterDefaults,
} as const
