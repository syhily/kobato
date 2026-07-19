import { z } from 'zod'

import type { Assert, Equals } from '@/shared/contracts/primitives'
import type { AdminPostDetailDto, AdminPostDto, ListPostRevisionsOutput, ListPostsOutput } from '@/shared/types/posts'

import { idString, isoDateTime } from '@/shared/contracts/primitives'
import { adminRevisionDto } from '@/shared/contracts/revision'

export const adminPostDto = z.object({
  id: idString,
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  cover: z.string(),
  og: z.string().nullable(),
  published: z.boolean(),
  commentsEnabled: z.boolean(),
  showToc: z.boolean(),
  showUpdated: z.boolean(),
  visible: z.boolean(),
  publishedAt: isoDateTime,
  publishedRevisionId: idString.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  deletedAt: isoDateTime.nullable(),
  category: z.string(),
  categoryId: idString.nullable(),
  tags: z.array(z.string()),
  alias: z.array(z.string()),
  authorId: idString.nullable(),
  authorName: z.string().nullable(),
  pinnedAt: isoDateTime.nullable(),
  firstPublishedAt: isoDateTime.nullable(),
  commentCount: z.number().int().nonnegative(),
  commentPublicId: z.string(),
})

export const adminPostDetailDto = z.object({
  post: adminPostDto,
  latestRevision: adminRevisionDto.nullable(),
  publishedRevision: adminRevisionDto.nullable(),
})

export const listPostsOutputDto = z.object({
  posts: z.array(adminPostDto),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
})

export const listPostRevisionsOutputDto = z.object({
  revisions: z.array(adminRevisionDto),
})

// ─── parity assertions ─────────────────────────────────
type _adminPostDtoParity = Assert<Equals<z.infer<typeof adminPostDto>, AdminPostDto>>
type _adminPostDetailParity = Assert<Equals<z.infer<typeof adminPostDetailDto>, AdminPostDetailDto>>
type _listPostsOutputParity = Assert<Equals<z.infer<typeof listPostsOutputDto>, ListPostsOutput>>
type _listPostRevisionsOutputParity = Assert<
  Equals<z.infer<typeof listPostRevisionsOutputDto>, ListPostRevisionsOutput>
>
