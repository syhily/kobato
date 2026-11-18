import { parseAssetUrlPath, STORAGE_ROUTE_PREFIX } from '@kobato/assets/asset-url.ts'
import { honeypotField, idString, isoDateTime, okDto } from '@kobato/contracts/primitives.ts'
import { HTTP_URL_MESSAGE, isHttpUrl } from '@kobato/utils/safe-url.ts'
import { z } from 'zod'

export const adminFriendDto = z.object({
  id: idString,
  website: z.string(),
  description: z.string().nullable(),
  homepage: z.string(),
  poster: z.string(),
  rssUrl: z.string().nullable(),
  visible: z.boolean(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type AdminFriendDto = z.infer<typeof adminFriendDto>

// Admin friends wire inputs — the single Zod source the `@kobato/api` friends
// contract composes and the server validates against.

// Trim; blank or null → `undefined` so optional fields never store ''. Null
// stays accepted — the admin wire forwards the DTO's nullable columns verbatim.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value === null || value === undefined || value === '' ? undefined : value))

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
export type ListFriendsInput = z.infer<typeof listFriendsSchema>

export const friendIdSchema = z.object({
  id: z.string().min(1),
})
export type FriendIdInput = z.infer<typeof friendIdSchema>

export const upsertFriendSchema = z.object({
  // Present = update, absent = create; stringified bigint matches the admin wire.
  id: z.string().min(1).optional(),
  website: z.string().trim().min(1).max(80),
  description: optionalText(999),
  homepage: z.url().max(500),
  poster: z.union([
    z.url().max(500),
    z
      .string()
      .max(500)
      .refine((value) => parseAssetUrlPath(value)?.route === STORAGE_ROUTE_PREFIX),
  ]),
  rssUrl: z
    .union([z.url().max(500), z.literal(''), z.null()])
    .optional()
    .transform((value) => (value === null || value === undefined || value === '' ? undefined : value)),
  visible: z.boolean().optional().default(true),
})
export type UpsertFriendInput = z.infer<typeof upsertFriendSchema>

export const adminFriendsListOutputDto = z.object({
  friends: z.array(adminFriendDto),
  total: z.number(),
  hasMore: z.boolean(),
})
export type AdminFriendsListOutput = z.infer<typeof adminFriendsListOutputDto>

export const adminFriendUpsertOutputDto = z.object({ friend: adminFriendDto })
export type AdminFriendUpsertOutput = z.infer<typeof adminFriendUpsertOutputDto>

// ---------------------------------------------------------------------------
// Public `friends.apply` surface — the single Zod source the `@kobato/api`
// friends contract composes.
// ---------------------------------------------------------------------------

const friendApplyHoneypot = honeypotField('contact')

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
export type ApplyFriendInput = z.input<typeof applyFriendSchema>

export const friendsApplyOutputSchema = okDto
