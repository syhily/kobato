import { commentEditorStateSchema } from '@kobato/inkling/headless/comment-schema'
import { z } from 'zod'

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

export type MyCommentsStatus = 'all' | 'pending' | 'deleteRequested' | 'deleted'

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
