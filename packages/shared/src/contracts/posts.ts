import { adminMetaBaseDto } from '@kobato/shared/contracts/admin-meta.ts'
import { idString, isoDateTime } from '@kobato/shared/contracts/primitives.ts'
import { adminRevisionDto } from '@kobato/shared/contracts/revision.ts'
import { z } from 'zod'

export const adminPostDto = adminMetaBaseDto.extend({
  visible: z.boolean(),
  category: z.string(),
  categoryId: idString.nullable(),
  tags: z.array(z.string()),
  alias: z.array(z.string()),
  pinnedAt: isoDateTime.nullable(),
  /** Null until the first successful publish. */
  firstPublishedAt: isoDateTime.nullable(),
})
export type AdminPostDto = z.infer<typeof adminPostDto>

export const adminPostDetailDto = z.object({
  post: adminPostDto,
  latestRevision: adminRevisionDto.nullable(),
  publishedRevision: adminRevisionDto.nullable(),
})
export type AdminPostDetailDto = z.infer<typeof adminPostDetailDto>

export const listPostsOutputDto = z.object({
  posts: z.array(adminPostDto),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
})
export type ListPostsOutput = z.infer<typeof listPostsOutputDto>

export const listPostRevisionsOutputDto = z.object({
  revisions: z.array(adminRevisionDto),
})
export type ListPostRevisionsOutput = z.infer<typeof listPostRevisionsOutputDto>
