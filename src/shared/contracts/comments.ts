import { z } from 'zod'

import type { Assert, Equals } from '@/shared/contracts/primitives'
import type { AdminCommentWire, AdminPendingDashboardDto, CommentItemWire } from '@/shared/types/comments'

import { idString, isoDateTime } from '@/shared/contracts/primitives'
import { commentBodySchema } from '@/shared/pt/comment-schema'

export const adminPendingDashboardDto = z.object({
  items: z.array(
    z.object({
      id: idString,
      kind: z.enum(['approval', 'deletion']),
      authorName: z.string(),
      authorLink: z.string().nullable(),
      excerpt: z.string(),
      createdAtIso: isoDateTime,
      deleteRequestedAtIso: isoDateTime.nullable(),
      pageTitle: z.string().nullable(),
      pagePermalink: z.string().nullable(),
    }),
  ),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  counts: z.object({
    all: z.number().int().nonnegative(),
    approval: z.number().int().nonnegative(),
    deletion: z.number().int().nonnegative(),
  }),
})

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

export const commentItemDto: z.ZodType<CommentItemWire> = commentBaseDto.extend({
  children: z.lazy(() => z.array(commentItemDto).optional()),
}) as z.ZodType<CommentItemWire>

// ─── admin comment wire (includes PII fields + content) ───
export const adminCommentBaseDto = commentBaseDto.extend({
  content: z.string().nullable(),
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

// ─── re-exports ────────────────────────────────────────
export type { AdminCommentWire, CommentItemWire } from '@/shared/types/comments'

// ─── parity assertions ─────────────────────────────────
type _adminPendingDashboardParity = Assert<Equals<z.infer<typeof adminPendingDashboardDto>, AdminPendingDashboardDto>>
type _commentItemWireParity = Assert<Equals<z.infer<typeof commentItemDto>, CommentItemWire>>
type _adminCommentWireParity = Assert<Equals<z.infer<typeof adminCommentDto>, AdminCommentWire>>
