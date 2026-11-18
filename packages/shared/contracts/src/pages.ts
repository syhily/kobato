import { adminMetaBaseDto, upsertMetaBaseSchema } from '@kobato/contracts/content-admin-base.ts'
import { safeBoolean } from '@kobato/contracts/primitives.ts'
import { adminRevisionDto } from '@kobato/contracts/revision.ts'
import { z } from 'zod'

// Admin pages wire inputs — the single Zod source the `@kobato/api` pages
// contract composes and the server validates against.

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
  /** Render the global friends grid at the bottom of the page detail route. */
  showFriends: z.boolean(),
})
export type AdminPageDto = z.infer<typeof adminPageDto>

export const adminPageUnpublishOutputDto = z.object({ page: adminPageDto })
export type AdminPageUnpublishOutput = z.infer<typeof adminPageUnpublishOutputDto>

export const adminPageUpsertMetaOutputDto = z.object({ page: adminPageDto })
export type AdminPageUpsertMetaOutput = z.infer<typeof adminPageUpsertMetaOutputDto>

export const adminPageDetailDto = z.object({
  page: adminPageDto,
  /** Latest revision (draft preferred over published). */
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
