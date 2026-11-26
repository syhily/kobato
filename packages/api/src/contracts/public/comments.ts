import { honeypotField, idString, isoDateTime, successDto } from '@kobato/api/contracts/primitives'
import { commentEditorStateSchema, type CommentEditorState } from '@kobato/inkling/headless/comment-schema'
import { httpUrlOrEmptyStringSchema } from '@kobato/utils/url-schema'
import { z } from 'zod'

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

export const commentUpdateOwnInputSchema = z.object({ commentId: z.string(), body: commentEditorStateSchema })
export type CommentUpdateOwnInput = z.input<typeof commentUpdateOwnInputSchema>
export const commentIdInputSchema = z.object({ commentId: z.string() })
export type CommentIdInput = z.infer<typeof commentIdInputSchema>

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
