import { z } from 'zod'

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
  webmentionsEnabled: z.boolean(),
  showToc: z.boolean(),
  // Opt the post into rendering「修改于 XXXX」next to the first-publish
  // date on the public detail page. Toggled from the editor meta sidebar
  // (next to the TOC toggle); defaults `false`.
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
  /** Null until the first successful publish. */
  firstPublishedAt: isoDateTime.nullable(),
  // Approved comment count for this post's metric row. Populated by
  // the admin list endpoint; `0` on detail / save paths.
  commentCount: z.number().int().nonnegative(),
  // The post's `metric.public_id` UUID — the opaque wire identifier the
  // admin comment-count link uses to deep-link into
  // `/admin/comments?pageKey=<uuid>`. Empty string on detail / save
  // paths that don't fan out a metric upsert.
  commentPublicId: z.string(),
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
