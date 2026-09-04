import { z } from 'zod'

import { commentEditorStateSchema } from '@/shared/lexical/comment-schema'
import { httpUrlOrEmptyStringSchema } from '@/shared/utils/safe-url'
import { honeypotField } from '@/shared/utils/schema'

const commentHoneypot = honeypotField('subtitle')

// JSON callers send `rid` as a number; `0` means top-level reply and is
// normalised to `undefined` before `createComment`.
export const commentReplySchema = z
  .object({
    page_key: z.string(),
    name: z.string().max(100),
    email: z.email(),
    link: httpUrlOrEmptyStringSchema.optional(),
    body: commentEditorStateSchema,
    /** Retained for schema compatibility; no longer used. */
    rid: z.number().optional(),
    /** Leave blank — used for bot filtering only; stripped before `createComment`. */
    subtitle: commentHoneypot.schema,
  })
  .superRefine(commentHoneypot.refine)
export type CommentReplyInput = z.infer<typeof commentReplySchema>

export const commentRidSchema = z.object({
  rid: z.string().regex(/^\d+$/, { message: '评论 ID 必须是数字' }),
})
export type CommentRidInput = z.infer<typeof commentRidSchema>

export const commentEditSchema = z.object({ rid: z.string(), body: commentEditorStateSchema })
export type CommentEditInput = z.infer<typeof commentEditSchema>

export const loadCommentsSchema = z.object({
  page_key: z.string(),
  offset: z.coerce.number(),
})
export type LoadCommentsInput = z.infer<typeof loadCommentsSchema>

export const loadAllCommentsSchema = z.object({
  offset: z.number().min(0),
  limit: z.number().min(1).max(100),
  pageKey: z.string().optional(),
  userId: z.string().optional(),
  status: z.enum(['all', 'pending', 'approved']).optional(),
  q: z.string().trim().max(200).optional(),
  match: z.enum(['contains', 'does-not-contain']).optional(),
  createdAfter: z.iso.datetime().optional(),
  createdBefore: z.iso.datetime().optional(),
})
export type LoadAllCommentsInput = z.infer<typeof loadAllCommentsSchema>

// Server-side autocomplete inputs for the moderation Combobox filters.
// `ids` rehydrates a selection from `?userId=` (comma-separated); `key` is
// the single-value page-key equivalent (page keys may contain `,`).
export const filterAutocompleteSchema = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  ids: z
    .string()
    .max(400)
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    ),
  key: z.string().max(2048).optional(),
})
export type FilterAutocompleteInput = z.infer<typeof filterAutocompleteSchema>
