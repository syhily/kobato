import { z } from 'zod'

import { coerceBoolean, sortOrderSchema } from '@/server/domains/settings/schemas/shared'

export const contentSchema = z.object({
  pagination: z.object({
    posts: z.coerce.number().int().min(1).max(100),
    category: z.coerce.number().int().min(1).max(100),
    tags: z.coerce.number().int().min(1).max(100),
    search: z.coerce.number().int().min(1).max(100),
  }),
  feed: z.object({
    full: coerceBoolean,
    size: z.coerce.number().int().min(1).max(100),
  }),
  post: z.object({
    sort: sortOrderSchema,
    sortBy: z.enum(['publishedAt', 'updatedAt']).default('publishedAt'),
    featureEnabled: coerceBoolean.default(false),
  }),
  footnotes: z
    .object({
      sectionTitle: z.string().trim().min(1).max(120),
    })
    .default({ sectionTitle: '尾声礼记' }),
})
