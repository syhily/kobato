import { z } from 'zod'

import { adminMetaBaseDto } from '@/shared/contracts/admin-meta'
import { adminRevisionDto } from '@/shared/contracts/revision'

// Shared content meta fields come from `adminMetaBaseDto`; only the
// page-only field is stated here.
export const adminPageDto = adminMetaBaseDto.extend({
  /** Render the global friends grid at the bottom of the page detail route. */
  showFriends: z.boolean(),
})
export type AdminPageDto = z.infer<typeof adminPageDto>

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
