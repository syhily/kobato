import { z } from 'zod'

import { idString, isoDateTime } from '@/shared/contracts/primitives'
import { commentBodySchema } from '@/shared/pt/comment-schema'

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

// ─── comments (public wire — no PII) ───
export const commentBaseDto = z.object({
  id: idString,
  createAt: isoDateTime,
  updatedAt: isoDateTime,
  deleteAt: isoDateTime.nullable(),
  deleteRequestedAt: isoDateTime.nullable().optional(),
  body: commentBodySchema,
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

// The recursive `children` branch uses a getter so zod resolves the schema
// lazily and `z.infer` derives the recursive wire type directly.
export const commentItemDto = commentBaseDto.extend({
  get children() {
    return z.array(commentItemDto).optional()
  },
  // Thread-cap markers (see `parseComments`): present ONLY on a root whose
  // reply thread exceeded the server-side cap. `childrenTotal` carries the
  // full visible reply count so a future "load more" affordance knows how
  // much was held back.
  childrenTruncated: z.boolean().optional(),
  childrenTotal: z.number().int().nonnegative().optional(),
})
export type CommentItemWire = z.infer<typeof commentItemDto>

// Shared output of the own-comment mutation trio (`comments.updateOwn` /
// `requestDeleteOwn` / `cancelDeleteOwn`): the updated wire comment, so the
// public comments reducer stays the single sync owner and the leaves never
// need a full-loader revalidation to flip one flag.
export const ownCommentMutationDto = z.object({ comment: commentItemDto })
export type OwnCommentMutationOutput = z.infer<typeof ownCommentMutationDto>

// ─── admin comment wire (includes PII fields + content) ───
export const adminCommentBaseDto = commentBaseDto.extend({
  content: z.string().nullable(),
  ua: z.string().nullable(),
  ip: z.string().nullable(),
  email: z.string(),
})

export const adminCommentDto = adminCommentBaseDto.extend({
  pageTitle: z.string().nullable(),
  // The metric's `public_id` UUID for the page the comment belongs to.
  // Drives the admin moderation filter Combobox.
  pagePublicId: z.string().nullable(),
  pageCover: z.string().nullable(),
  // Fully-qualified public URL for the page this comment belongs to.
  // Powers the per-row "查看文章" overflow-menu item.
  pagePermalink: z.string().nullable(),
})
export type AdminCommentWire = z.infer<typeof adminCommentDto>
