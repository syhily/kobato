import { upsertMetaBaseSchema } from '@kobato/server/domains/content/schemas/meta-fields.ts'
import { safeBoolean } from '@kobato/utils/schema.ts'
import { z } from 'zod'

export const listPagesSchema = z.object({
  q: z.string().trim().max(100).optional(),
  deletedStatus: z.enum(['all', 'deleted', 'normal']).optional().default('normal'),
  published: z.coerce.boolean().optional(),
  authorId: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export const upsertPageMetaSchema = upsertMetaBaseSchema.extend({
  showFriends: safeBoolean().optional(),
})
