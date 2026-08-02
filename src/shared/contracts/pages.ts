import { z } from 'zod'

import { idString, isoDateTime } from '@/shared/contracts/primitives'
import { adminRevisionDto } from '@/shared/contracts/revision'

export const adminPageDto = z.object({
  id: idString,
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  cover: z.string(),
  og: z.string().nullable(),
  published: z.boolean(),
  commentsEnabled: z.boolean(),
  webmentionsEnabled: z.boolean(),
  showToc: z.boolean(),
  /** Render the "Updated on XXXX" secondary timestamp on the public detail page. */
  showUpdated: z.boolean(),
  /** Render the global friends grid at the bottom of the page detail route. */
  showFriends: z.boolean(),
  /** ISO-8601. Editable from the metadata panel. */
  publishedAt: isoDateTime,
  /** `null` while the page has never been published. */
  publishedRevisionId: idString.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  /** When non-null the row is soft-deleted. */
  deletedAt: isoDateTime.nullable(),
  authorId: idString.nullable(),
  authorName: z.string().nullable(),
  /** Approved comment count for this page's metric row. */
  commentCount: z.number().int().nonnegative(),
  /** The page's `metric.public_id` UUID — used by the admin comment-count link. */
  commentPublicId: z.string(),
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
