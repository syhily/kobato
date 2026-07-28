import { z } from 'zod'

import { idSchema, upsertMetaBaseSchema } from '@/server/domains/content/schemas/meta-fields'
import { safeBoolean } from '@/shared/utils/schema'

export const listPagesSchema = z.object({
  q: z.string().trim().max(100).optional(),
  deletedStatus: z.enum(['all', 'deleted', 'normal']).optional().default('normal'),
  published: z.coerce.boolean().optional(),
  authorId: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export const getPageSchema = idSchema
export const deletePageSchema = idSchema
export const restorePageSchema = idSchema
export const unpublishPageSchema = idSchema
export const listPageRevisionsSchema = idSchema

export const upsertPageMetaSchema = upsertMetaBaseSchema.extend({
  showFriends: safeBoolean().optional(),
})

export const renderMathSchema = z.object({
  tex: z.string().max(4 * 1024, 'TeX 表达式过长'),
  display: safeBoolean(),
})
