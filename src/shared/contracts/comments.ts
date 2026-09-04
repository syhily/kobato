import { z } from 'zod'

import type { Assert, Equals } from '@/shared/contracts/primitives'
import type { CommentAndUser } from '@/shared/types/comments'

import { idString, isoDateTime } from '@/shared/contracts/primitives'
import { commentEditorStateSchema } from '@/shared/lexical/comment-schema'

// Welcome-dashboard moderation inbox row. Same shape for both queues —
// the `kind` discriminator decides which buttons the UI renders.
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

// comments (public wire — no PII)
export const commentBaseDto = z.object({
  id: idString,
  createAt: isoDateTime,
  updatedAt: isoDateTime,
  deleteAt: isoDateTime.nullable(),
  deleteRequestedAt: isoDateTime.nullable().optional(),
  body: commentEditorStateSchema,
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

// Compile-time PII-split guard: the public wire carries exactly the
// `CommentAndUser` fields minus the PII / server-only set. Adding a field to
// `CommentAndUser` fails the typecheck until it is either added to the DTO or
// consciously appended to this omission list — the split can never leak by
// drift. (Value shapes intentionally differ: string ids, ISO timestamps.)
type _publicWireKeyParity = Assert<
  Equals<keyof z.infer<typeof commentBaseDto>, keyof Omit<CommentAndUser, 'content' | 'ua' | 'ip' | 'email'>>
>

// The recursive `children` branch uses a getter so zod resolves the schema
// lazily and `z.infer` derives the recursive wire type directly.
export const commentItemDto = commentBaseDto.extend({
  get children() {
    return z.array(commentItemDto).optional()
  },
  // Thread-cap markers (see `parseComments`): present ONLY on a root whose
  // reply thread exceeded the cap; `childrenTotal` is the full visible count.
  childrenTruncated: z.boolean().optional(),
  childrenTotal: z.number().int().nonnegative().optional(),
})
export type CommentItemWire = z.infer<typeof commentItemDto>

// Shared output of the own-comment mutation trio: the updated wire
// comment, so the public reducer stays the single sync owner.
export const ownCommentMutationDto = z.object({ comment: commentItemDto })
export type OwnCommentMutationOutput = z.infer<typeof ownCommentMutationDto>

// admin comment wire (includes PII fields + content)
export const adminCommentBaseDto = commentBaseDto.extend({
  content: z.string().nullable(),
  ua: z.string().nullable(),
  ip: z.string().nullable(),
  email: z.string(),
})

export const adminCommentDto = adminCommentBaseDto.extend({
  pageTitle: z.string().nullable(),
  // The metric's `public_id` UUID; drives the admin moderation filter Combobox.
  pagePublicId: z.string().nullable(),
  pageCover: z.string().nullable(),
  // Fully-qualified public URL; powers the per-row "查看文章" overflow item.
  pagePermalink: z.string().nullable(),
})
export type AdminCommentWire = z.infer<typeof adminCommentDto>
