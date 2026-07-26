import { z } from 'zod'

import { coerceBoolean, sortOrderSchema } from '@/server/domains/settings/sections/shared'

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

export const contentDefaults = {
  pagination: { posts: 10, category: 10, tags: 10, search: 10 },
  feed: { full: false, size: 20 },
  post: { sort: 'desc' as const, sortBy: 'publishedAt' as const, featureEnabled: false },
  footnotes: { sectionTitle: '尾声礼记' },
} as const

export const contentSection = {
  scope: 'blog.content',
  key: 'content',
  schema: contentSchema,
  defaults: contentDefaults,
} as const
