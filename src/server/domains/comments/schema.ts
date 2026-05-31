import { z } from 'zod'

import { commentBodySchema } from '@/shared/pt/comment-schema'
import { httpUrlOrEmptyStringSchema } from '@/shared/utils/safe-url'

/** Honeypot field: must stay empty (bots often fill every text input). */
const COMMENT_HONEYPOT_MAX_LEN = 240

// `rid` arrives as a number from JSON callers. The previous form-encoded
// path coerced from string; comments now POST JSON exclusively because
// PortableText bodies aren't form-encodable, so `z.number()` is enough.
// `0` keeps its "top-level reply" meaning and gets normalised to
// `undefined` before reaching `createComment`.
export const commentReplySchema = z
  .object({
    page_key: z.string(),
    name: z.string(),
    email: z.email(),
    link: httpUrlOrEmptyStringSchema.optional(),
    body: commentBodySchema,
    /** Removed — no longer used. */
    rid: z.number().optional(),
    /** Leave blank — used for bot filtering only; stripped before `createComment`. */
    subtitle: z.string().max(COMMENT_HONEYPOT_MAX_LEN).optional().default(''),
  })
  .superRefine((val, ctx) => {
    if (val.subtitle.trim().length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: '输入数据无效。',
        path: ['subtitle'],
      })
    }
  })
export type CommentReplyInput = z.infer<typeof commentReplySchema>

export const commentRidSchema = z.object({ rid: z.string() })
export type CommentRidInput = z.infer<typeof commentRidSchema>

export const commentEditSchema = z.object({ rid: z.string(), body: commentBodySchema })
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
  createdAfter: z.iso.datetime().optional(),
  createdBefore: z.iso.datetime().optional(),
})
export type LoadAllCommentsInput = z.infer<typeof loadAllCommentsSchema>

// Server-side autocomplete inputs for the moderation Combobox filters.
// Both endpoints accept the same shape so the schema is shared. `q` is
// trimmed and capped at 100 chars (any sane substring fits) and `limit`
// is hard-bounded so a malicious caller can't request 1M rows.
//
// `ids` is an optional, comma-separated list of user identifiers the
// caller wants to "rehydrate" (e.g. when restoring a Combobox
// selection from a `?userId=2232` URL parameter — the URL only carries
// the value, never the human label, so the client needs a one-shot
// lookup to render "雨帆" instead of "2232" in the trigger). When
// `ids` is present the authors endpoint returns an exact-match by id
// and ignores `q` to avoid mixing two query intents in one round-trip.
//
// `key` is the page-flavoured equivalent: a single page `key` (a URL
// such as `https://example.com/about/`) used to rehydrate the page-title
// Combobox from a `?pageKey=…` URL parameter. Page keys are not
// comma-safe (URL fragments may legally contain `,`), so unlike `ids`
// we accept a single value rather than splitting.
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
