import { z } from 'zod'

import { safeBoolean } from '@/shared/utils/schema'

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, 'Invalid slug')

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value ?? '')

const idSchema = z.object({
  id: z.string().min(1),
})

export const listPagesSchema = z.object({
  q: z.string().trim().max(100).optional(),
  deletedStatus: z.enum(['all', 'deleted', 'normal']).optional().default('normal'),
  published: z.coerce.boolean().optional(),
  authorId: z.coerce.bigint().optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export const getPageSchema = idSchema
export const deletePageSchema = idSchema
export const restorePageSchema = idSchema
export const unpublishPageSchema = idSchema
export const listPageRevisionsSchema = idSchema

export const upsertPageMetaSchema = z.object({
  id: z.string().min(1).optional(),
  slug: slugSchema.optional(),
  title: z.string().trim().min(1).max(200),
  summary: optionalText(500),
  cover: z.string().trim().max(500).optional().default(''),
  og: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((value) => (value === undefined || value === '' ? null : value)),
  published: safeBoolean().optional(),
  commentsEnabled: safeBoolean().optional(),
  showToc: safeBoolean().optional(),
  showUpdated: safeBoolean().optional(),
  showFriends: safeBoolean().optional(),
  publishedAt: z.iso.datetime({ offset: true }).optional(),
})

export const renderMathSchema = z.object({
  tex: z.string().max(4 * 1024, 'TeX 表达式过长'),
  display: safeBoolean(),
})
