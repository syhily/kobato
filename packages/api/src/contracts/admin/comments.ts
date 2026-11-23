import { idString, isoDateTime } from '@kobato/api/contracts/primitives'
import { commentBaseDto } from '@kobato/api/contracts/public/comments'
import { commentEditorStateSchema } from '@kobato/inkling/headless/comment-schema'
import { z } from 'zod'

const adminPendingItemDto = z.object({
  id: idString,
  kind: z.enum(['approval', 'deletion']),
  authorName: z.string(),
  authorLink: z.string().nullable(),
  excerpt: z.string(),
  createdAtIso: isoDateTime,
  deleteRequestedAtIso: isoDateTime.nullable(),
  pageTitle: z.string().nullable(),
  pagePermalink: z.string().nullable(),
})
export type AdminPendingItemDto = z.infer<typeof adminPendingItemDto>

export const adminPendingDashboardDto = z.object({
  items: z.array(adminPendingItemDto),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  counts: z.object({
    all: z.number().int().nonnegative(),
    approval: z.number().int().nonnegative(),
    deletion: z.number().int().nonnegative(),
  }),
})
export type AdminPendingDashboardDto = z.infer<typeof adminPendingDashboardDto>

export const adminCommentBaseDto = commentBaseDto.extend({
  ua: z.string().nullable(),
  ip: z.string().nullable(),
  email: z.string(),
})

export const adminCommentDto = adminCommentBaseDto.extend({
  pageTitle: z.string().nullable(),
  pagePublicId: z.string().nullable(),
  pageCover: z.string().nullable(),
  pagePermalink: z.string().nullable(),
})
export type AdminCommentWire = z.infer<typeof adminCommentDto>

export type AdminPendingKind = 'all' | 'approval' | 'deletion'

export type ListPendingDashboardOutput = AdminPendingDashboardDto

export const adminCommentIdInput = z.object({ commentId: z.string() })
export type AdminCommentIdInput = z.infer<typeof adminCommentIdInput>

export const adminCommentEditInput = z.object({ commentId: z.string(), body: commentEditorStateSchema })
export type AdminCommentEditInput = z.infer<typeof adminCommentEditInput>

export const ADMIN_COMMENT_STATUSES = ['all', 'pending', 'approved', 'deleteRequested'] as const
export type AdminCommentStatus = (typeof ADMIN_COMMENT_STATUSES)[number]

export const COMMENT_TEXT_MATCHES = ['contains', 'does-not-contain'] as const
export type CommentTextMatch = (typeof COMMENT_TEXT_MATCHES)[number]

export const adminCommentsLoadAllInput = z.object({
  offset: z.number().min(0),
  limit: z.number().min(1).max(100),
  pageKey: z.string().optional(),
  userId: z.string().optional(),
  status: z.enum(ADMIN_COMMENT_STATUSES).optional(),
  q: z.string().trim().max(200).optional(),
  match: z.enum(COMMENT_TEXT_MATCHES).optional(),
  createdAfter: z.iso.datetime().optional(),
  createdBefore: z.iso.datetime().optional(),
})
export type AdminCommentsLoadAllInput = z.infer<typeof adminCommentsLoadAllInput>

export const adminCommentsLoadAllOutputDto = z.object({
  comments: z.array(adminCommentDto),
  total: z.number().int(),
  hasMore: z.boolean(),
  statusCounts: z.object({
    all: z.number().int(),
    pending: z.number().int(),
    approved: z.number().int(),
    deleteRequested: z.number().int(),
  }),
})
export type AdminCommentsLoadAllOutput = z.infer<typeof adminCommentsLoadAllOutputDto>

export const adminCommentFilterAutocompleteInput = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  ids: z.string().max(400).optional(),
  key: z.string().max(2048).optional(),
})
export type AdminCommentFilterAutocompleteInput = z.infer<typeof adminCommentFilterAutocompleteInput>

export const adminCommentSearchPagesOutputDto = z.object({
  pages: z.array(z.object({ key: z.string(), title: z.string().nullable() })),
})
export type AdminCommentSearchPagesOutput = z.infer<typeof adminCommentSearchPagesOutputDto>

export const adminCommentSearchAuthorsOutputDto = z.object({
  authors: z.array(z.object({ id: z.string(), name: z.string() })),
})
export type AdminCommentSearchAuthorsOutput = z.infer<typeof adminCommentSearchAuthorsOutputDto>

export const adminCommentApproveDeletionInput = z.object({ commentId: z.string(), approve: z.boolean() })
export type AdminCommentApproveDeletionInput = z.infer<typeof adminCommentApproveDeletionInput>

export const adminCommentApproveDeletionOutputDto = z.object({ success: z.boolean() })
export type AdminCommentApproveDeletionOutput = z.infer<typeof adminCommentApproveDeletionOutputDto>

export const adminCommentsPendingDashboardInput = z.object({
  kind: z.enum(['all', 'approval', 'deletion']).optional().default('all'),
  offset: z.number().optional(),
  limit: z.number().optional(),
})
export type AdminCommentsPendingDashboardInput = z.infer<typeof adminCommentsPendingDashboardInput>

export const adminAvatarMirrorProbeOutputDto = z.object({
  results: z.array(z.object({ url: z.string(), reachable: z.boolean(), latencyMs: z.number() })),
})
export type AdminAvatarMirrorProbeOutput = z.infer<typeof adminAvatarMirrorProbeOutputDto>

export const adminCommentsPendingCountOutputSchema = z.object({
  all: z.number().int().nonnegative(),
})
