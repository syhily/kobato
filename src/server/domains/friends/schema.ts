import { z } from 'zod'

import { isHttpUrl } from '@/shared/utils/safe-url'
import { honeypotField } from '@/shared/utils/schema'

// Trim; blank or null → `undefined` so optional fields never store ''. Null
// stays accepted — the admin wire forwards the DTO's nullable columns verbatim.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value === null || value === undefined || value === '' ? undefined : value))

// Coerced from query strings; `limit` caps at 100, matching the tag list.
export const listFriendsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  includeHidden: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
    .optional()
    .default(false),
  // Exact match; omit for the classic includeHidden behavior.
  visible: z.boolean().optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export const friendIdSchema = z.object({
  id: z.string().min(1),
})

export const upsertFriendSchema = z.object({
  // Present = update, absent = create; stringified bigint matches the admin wire.
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

const friendApplyHoneypot = honeypotField('contact')

const HTTP_URL_MESSAGE = '请输入 http(s) URL'

// Optional http(s) URL; blank → undefined, mirroring `upsertFriendSchema`.
const optionalHttpUrl = () =>
  z
    .union([z.url().max(500).refine(isHttpUrl, { message: HTTP_URL_MESSAGE }), z.literal('')])
    .optional()
    .transform((value) => (value === undefined || value === '' ? undefined : value))

// Public `friends.apply` schema. URLs must be http(s) — anonymous write, a
// `javascript:` homepage must never reach the pending queue. Honeypot is
// named `contact`, distinct from the comment form's `subtitle`.
export const applyFriendSchema = z
  .object({
    website: z.string().trim().min(1).max(80),
    homepage: z.url().max(500).refine(isHttpUrl, { message: HTTP_URL_MESSAGE }),
    description: optionalText(999),
    poster: optionalHttpUrl(),
    rssUrl: optionalHttpUrl(),
    /** Leave blank — used for bot filtering only; stripped before `applyFriend`. */
    contact: friendApplyHoneypot.schema,
  })
  .superRefine(friendApplyHoneypot.refine)
export type ApplyFriendInput = z.infer<typeof applyFriendSchema>
