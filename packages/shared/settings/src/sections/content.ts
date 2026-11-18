import { DEFAULT_FOOTNOTES_SECTION_TITLE } from '@kobato/settings/footnotes-section-title.ts'
import { coerceBoolean, sortOrderSchema } from '@kobato/settings/sections/shared.ts'
import { z } from 'zod'

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
    .default({ sectionTitle: DEFAULT_FOOTNOTES_SECTION_TITLE }),
})

export const contentDefaults = {
  pagination: { posts: 10, category: 10, tags: 10, search: 10 },
  feed: { full: false, size: 20 },
  post: { sort: 'desc' as const, sortBy: 'publishedAt' as const, featureEnabled: false },
  footnotes: { sectionTitle: DEFAULT_FOOTNOTES_SECTION_TITLE },
} as const

export const contentSection = {
  scope: 'blog.content',
  key: 'content',
  schema: contentSchema,
  defaults: contentDefaults,
} as const
