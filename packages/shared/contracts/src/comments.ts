import { honeypotField, idString, isoDateTime, successDto } from '@kobato/contracts/primitives'
import { commentEditorStateSchema, type CommentEditorState } from '@kobato/inkling/headless/comment-schema'
import { httpUrlOrEmptyStringSchema } from '@kobato/utils/url-schema'
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

export const commentBaseDto = z.object({
  id: idString,
  createAt: isoDateTime,
  updatedAt: isoDateTime,
  deleteAt: isoDateTime.nullable(),
  deleteRequestedAt: isoDateTime.nullable().optional(),
  body: commentEditorStateSchema,
  content: z.string().nullable(),
  type: z.enum(['post', 'page']).nullable(),
  ownerId: idString.nullable(),
  userId: idString,
  isVerified: z.boolean().nullable(),
  rid: z.number().int().nonnegative(),
  isCollapsed: z.boolean().nullable(),
  isPending: z.boolean().nullable(),
  isPinned: z.boolean().nullable(),
  voteUp: z.number().nullable(),
  voteDown: z.number().nullable(),
  rootId: idString.nullable(),
  name: z.string(),
  emailVerified: z.boolean(),
  link: z.string().nullable(),
  badgeName: z.string().nullable(),
  badgeColor: z.string().nullable(),
  badgeTextColor: z.string().nullable(),
})

export const commentItemDto = commentBaseDto.extend({
  get children() {
    return z.array(commentItemDto).optional()
  },
  childrenTruncated: z.boolean().optional(),
  childrenTotal: z.number().int().nonnegative().optional(),
})
export type CommentItemWire = z.infer<typeof commentItemDto>

export const ownCommentMutationDto = z.object({ comment: commentItemDto })
export type OwnCommentMutationOutput = z.infer<typeof ownCommentMutationDto>

const commentHoneypot = honeypotField('subtitle')

export const commentReplySchema = z
  .object({
    page_key: z.string(),
    name: z.string().max(100),
    email: z.email(),
    link: httpUrlOrEmptyStringSchema.optional(),
    body: commentEditorStateSchema,
    rid: z.number().optional(),
    subtitle: commentHoneypot.schema,
  })
  .superRefine(commentHoneypot.refine)

export const commentRidSchema = z.object({
  rid: z.string().regex(/^\d+$/, { message: 'comments.error.idInvalid' as const }),
})

export const commentEditInputSchema = commentRidSchema.extend({ body: commentEditorStateSchema })

export const commentListInputSchema = z.object({ page_key: z.string(), offset: z.number() })
export const commentListOutputSchema = z.object({ comments: z.array(commentItemDto), next: z.boolean() })
export const replyCommentOutputSchema = z.object({ comment: commentItemDto })
export const commentGetRawOutputSchema = z.object({ body: commentEditorStateSchema })

export const commentRevokeTokenInputSchema = z.object({ rid: z.string() })
export const commentRevokeTokenOutputSchema = successDto
export const commentMyCommentsInputSchema = z.object({ page_key: z.string() })
export const myCommentsOutputSchema = z.object({
  comments: z.array(commentItemDto),
  expiresAt: z.record(z.string(), z.number()),
})

export const commentUpdateOwnInputSchema = z.object({ commentId: z.string(), body: commentEditorStateSchema })
export type CommentUpdateOwnInput = z.input<typeof commentUpdateOwnInputSchema>
export const commentIdInputSchema = z.object({ commentId: z.string() })
export type CommentIdInput = z.infer<typeof commentIdInputSchema>

export const myCommentItemDto = z.object({
  id: z.string(),
  body: commentEditorStateSchema,
  content: z.string().nullable(),
  createdAtIso: z.string(),
  deletedAtIso: z.string().nullable(),
  deleteRequestedAtIso: z.string().nullable(),
  isPending: z.boolean(),
  entity: z.object({ title: z.string(), permalink: z.string() }).nullable(),
  parent: z.object({ name: z.string(), excerpt: z.string(), isDeleted: z.boolean() }).nullable(),
})
export type MyCommentItem = z.infer<typeof myCommentItemDto>

export const commentLoadMineInputSchema = z.object({
  offset: z.coerce.number().min(0).default(0),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['all', 'pending', 'deleteRequested', 'deleted']).optional(),
  q: z.string().trim().max(200).optional(),
  entity: z.string().max(2048).optional(),
})
export type CommentLoadMineInput = z.input<typeof commentLoadMineInputSchema>

export const commentLoadMineOutputSchema = z.object({
  items: z.array(myCommentItemDto),
  total: z.number().int(),
  hasMore: z.boolean(),
})

export const commentSearchMineEntitiesInputSchema = z.object({ q: z.string().trim().max(100).optional() })
export const commentSearchMineEntitiesOutputSchema = z.object({
  entities: z.array(z.object({ value: z.string(), label: z.string() })),
})

export const avatarFindInputSchema = z.object({ email: z.email() })
export const avatarFindOutputSchema = z.object({ avatar: z.string() })

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

export interface CommentEntityRef {
  type: 'post' | 'page'
  ownerId: number
}

export function parseCommentEntity(raw: string | null | undefined): CommentEntityRef | null {
  if (!raw) {
    return null
  }

  const idx = raw.indexOf(':')
  if (idx <= 0) {
    return null
  }

  const type = raw.slice(0, idx)
  if (type !== 'post' && type !== 'page') {
    return null
  }

  const rest = raw.slice(idx + 1)
  if (!/^\d+$/.test(rest)) {
    return null
  }

  try {
    return { type, ownerId: Number(rest) }
  } catch {
    return null
  }
}

export function serializeCommentEntity(entity: CommentEntityRef): string {
  return `${entity.type}:${entity.ownerId}`
}

export interface LatestComment {
  title: string
  author: string
  authorLink: string
  permalink: string
}

export type AdminPendingKind = 'all' | 'approval' | 'deletion'

export interface Comments {
  count: number
  roots_count: number
}

export interface DetailPageComments {
  commentData: Comments | null
  commentItems: CommentItemWire[]
}

export interface CommentReq {
  page_key: string
  name: string
  email: string
  link?: string
  body: CommentEditorState
  rid?: number
}

export type CommentReplyInput = z.input<typeof commentReplySchema>

export type ReplyCommentInput = CommentReplyInput

export type CommentRidInput = z.infer<typeof commentRidSchema>

export type CommentEditInput = z.infer<typeof commentEditInputSchema>

export type LoadCommentsInput = z.input<typeof commentListInputSchema>

export type ReplyCommentOutput = z.infer<typeof replyCommentOutputSchema>

export type LoadCommentsOutput = z.infer<typeof commentListOutputSchema>

export type CommentRawOutput = z.infer<typeof commentGetRawOutputSchema>

export type MyCommentsOutput = z.infer<typeof myCommentsOutputSchema>

export type RevokeCommentTokenOutput = z.infer<typeof commentRevokeTokenOutputSchema>

export type FindAvatarInput = z.input<typeof avatarFindInputSchema>

export type FindAvatarOutput = z.infer<typeof avatarFindOutputSchema>

export type ListPendingDashboardOutput = AdminPendingDashboardDto

export type MyCommentsStatus = 'all' | 'pending' | 'deleteRequested' | 'deleted'

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

export const commentsMyCountsOutputSchema = z.object({
  total: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  deleteRequested: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
})
export type CommentsMyCountsOutput = z.infer<typeof commentsMyCountsOutputSchema>

export const commentsResolveEntityInputSchema = z.object({
  entity: z.string().min(1).max(2048),
})
export const commentsResolveEntityOutputSchema = z.object({ value: z.string(), label: z.string() }).nullable()
export type CommentsResolveEntityOutput = z.infer<typeof commentsResolveEntityOutputSchema>

export const adminCommentsPendingCountOutputSchema = z.object({
  all: z.number().int().nonnegative(),
})

export const adminWebmentionsPendingCountOutputSchema = z.number().int().nonnegative()
