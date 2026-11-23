import { adminMetaBaseDto, upsertMetaBaseSchema } from '@kobato/api/contracts/admin/content-admin-base'
import { adminRevisionDto } from '@kobato/api/contracts/admin/revision'
import { safeBoolean } from '@kobato/api/contracts/primitives'
import { z } from 'zod'

export const adminPageIdInput = z.object({ id: z.string().min(1) })
export type AdminPageIdInput = z.infer<typeof adminPageIdInput>

export const listPagesSchema = z.object({
  q: z.string().trim().max(100).optional(),
  deletedStatus: z.enum(['all', 'deleted', 'normal']).optional().default('normal'),
  published: z.coerce.boolean().optional(),
  authorId: z.coerce.number().int().optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})
export type ListPagesInput = z.infer<typeof listPagesSchema>

export const upsertPageMetaSchema = upsertMetaBaseSchema.extend({
  showFriends: safeBoolean().optional(),
})
export type UpsertPageMetaInput = z.infer<typeof upsertPageMetaSchema>

export const adminPageDto = adminMetaBaseDto.extend({
  showFriends: z.boolean(),
})
export type AdminPageDto = z.infer<typeof adminPageDto>

export const adminPageUnpublishOutputDto = z.object({ page: adminPageDto })
export type AdminPageUnpublishOutput = z.infer<typeof adminPageUnpublishOutputDto>

export const adminPageUpsertMetaOutputDto = z.object({ page: adminPageDto })
export type AdminPageUpsertMetaOutput = z.infer<typeof adminPageUpsertMetaOutputDto>

export const adminPageDetailDto = z.object({
  page: adminPageDto,
  latestRevision: adminRevisionDto.nullable(),
  publishedRevision: adminRevisionDto.nullable(),
})
export type AdminPageDetailDto = z.infer<typeof adminPageDetailDto>

export const listPagesOutputDto = z.object({
  pages: z.array(adminPageDto),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
})
export type ListPagesOutput = z.infer<typeof listPagesOutputDto>

export const listPageRevisionsOutputDto = z.object({
  revisions: z.array(adminRevisionDto),
})
export type ListPageRevisionsOutput = z.infer<typeof listPageRevisionsOutputDto>
