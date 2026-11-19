import { adminMetaBaseDto, upsertMetaBaseSchema } from '@kobato/contracts/content-admin-base.ts'
import { idString, isoDateTime, safeBoolean } from '@kobato/contracts/primitives.ts'
import { adminRevisionDto } from '@kobato/contracts/revision.ts'
import { z } from 'zod'

// Admin posts wire inputs — the single Zod source the `@kobato/api` posts
// contract composes and the server validates against.

export const adminPostIdInput = z.object({ id: z.string().min(1) })
export type AdminPostIdInput = z.infer<typeof adminPostIdInput>

export const listPostsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  deletedStatus: z.enum(['all', 'deleted', 'normal']).optional().default('normal'),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  categoryId: z.coerce.number().int().optional(),
  tag: z.string().trim().max(20).optional(),
  published: safeBoolean().optional(),
  visible: safeBoolean().optional(),
  sortBy: z.enum(['publishedAt', 'updatedAt']).optional().default('publishedAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  authorId: z.coerce.number().int().optional(),
})
export type ListPostsInput = z.infer<typeof listPostsSchema>

export const upsertPostMetaSchema = upsertMetaBaseSchema.extend({
  visible: safeBoolean().optional(),
  pinnedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  categoryId: z.coerce.number().int().nullable().optional(),
  tags: z.array(z.string().trim().max(20)).optional().default([]),
  alias: z
    .array(
      z
        .string()
        .trim()
        .max(80)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid alias slug'),
    )
    .optional()
    .default([]),
})
export type UpsertPostMetaInput = z.infer<typeof upsertPostMetaSchema>

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

export const adminPostUnpublishOutputDto = z.object({ post: adminPostDto })
export type AdminPostUnpublishOutput = z.infer<typeof adminPostUnpublishOutputDto>

export const adminPostUpsertMetaOutputDto = z.object({ post: adminPostDto })
export type AdminPostUpsertMetaOutput = z.infer<typeof adminPostUpsertMetaOutputDto>

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

/** The dashboard card shape shared by the wire output and the server projection. */
export interface DraftSummary {
  id: string
  title: string
  updatedAtIso: string
}

// Draft/published counts + the two recent-5 lists the dashboard cards
// consume (projected to `DraftSummary`, identical to `loaders/dashboard.ts`).
export const adminPostsMySummaryOutputSchema = z.object({
  draftCount: z.number().int().nonnegative(),
  publishedCount: z.number().int().nonnegative(),
  recentDrafts: z.custom<DraftSummary[]>(),
  recentPublished: z.custom<DraftSummary[]>(),
})
export type AdminPostsMySummaryOutput = z.infer<typeof adminPostsMySummaryOutputSchema>
