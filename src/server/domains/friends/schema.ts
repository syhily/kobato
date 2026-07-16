import { z } from 'zod'

import { isHttpUrl } from '@/shared/utils/safe-url'

// Helper: trim incoming text and treat null / the empty string as
// `undefined` so the optional Zod fields below don't coerce a blank
// input to a stored empty string. `null` is accepted because the
// admin upsert wire historically allowed it for cleared fields (the
// approve mutation forwards the DTO's nullable columns verbatim).
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value === null || value === undefined || value === '' ? undefined : value))

// `offset` / `limit` are coerced from query strings (the action is a
// GET and query params serialise numbers via `String(value)`).
// Hard upper bound on `limit` matches the tag list (100); the client
// only ever picks from {10, 20, 50, 100}.
export const listFriendsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  includeHidden: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
    .optional()
    .default(false),
  // Exact visibility match — the pending-review bucket passes
  // `visible: false`; omit it for the classic includeHidden behavior.
  visible: z.boolean().optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export const friendIdSchema = z.object({
  id: z.string().min(1),
})

export const upsertFriendSchema = z.object({
  // Optional — present means update, absent means create. Stringified
  // bigint matches the wire format used by the rest of the admin
  // surfaces (`AdminUserDto.id`, `AdminCommentDto.id`, …).
  id: z.string().min(1).optional(),
  website: z.string().trim().min(1).max(80),
  description: optionalText(999),
  homepage: z.url().max(500),
  poster: z.url().max(500),
  rssUrl: z
    .union([z.url().max(500), z.literal(''), z.null()])
    .optional()
    .transform((value) => (value === null || value === undefined || value === '' ? undefined : value)),
  visible: z.boolean().optional().default(true),
})

/** Honeypot field: must stay empty (bots often fill every text input). */
const FRIEND_APPLY_HONEYPOT_MAX_LEN = 240

const HTTP_URL_MESSAGE = '请输入 http(s) URL'

// Optional URL that must be http(s) when present. Mirrors the
// `rssUrl` union in `upsertFriendSchema` (blank → undefined) with the
// extra protocol refinement below.
const optionalHttpUrl = () =>
  z
    .union([z.url().max(500).refine(isHttpUrl, { message: HTTP_URL_MESSAGE }), z.literal('')])
    .optional()
    .transform((value) => (value === undefined || value === '' ? undefined : value))

// Public friend-link application (`friends.apply`). Mirrors the row
// shape of `upsertFriendSchema` minus the admin-only `id`/`visible`
// (applications always land as `visible: false`), with `poster`
// downgraded to optional — applicants rarely have a cover URL handy;
// the admin fills it before approving. URLs are refined to http(s)
// because this is an anonymous write: a `javascript:` homepage must
// never reach the pending queue (the public grid renders `homepage`
// as a raw href once approved). The honeypot is named `contact` —
// deliberately NOT the comment form's `subtitle` — so the two public
// forms don't share a bot signature.
export const applyFriendSchema = z
  .object({
    website: z.string().trim().min(1).max(80),
    homepage: z.url().max(500).refine(isHttpUrl, { message: HTTP_URL_MESSAGE }),
    description: optionalText(999),
    poster: optionalHttpUrl(),
    rssUrl: optionalHttpUrl(),
    /** Leave blank — used for bot filtering only; stripped before `applyFriend`. */
    contact: z.string().max(FRIEND_APPLY_HONEYPOT_MAX_LEN).optional().default(''),
  })
  .superRefine((val, ctx) => {
    if (val.contact.trim().length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: '输入数据无效。',
        path: ['contact'],
      })
    }
  })
export type ApplyFriendInput = z.infer<typeof applyFriendSchema>
