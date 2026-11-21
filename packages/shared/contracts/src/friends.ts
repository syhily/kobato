import { friendPosterStoragePath, friendPosterStoragePathFromUrl } from '@kobato/assets/images'
import { honeypotField, idString, isoDateTime, okDto } from '@kobato/contracts/primitives'
import { isHttpUrl } from '@kobato/utils/safe-url'
import { HTTP_URL_MESSAGE } from '@kobato/utils/url-schema'
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
  visible: z.boolean().optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})
export type ListFriendsInput = z.infer<typeof listFriendsSchema>

export const friendIdSchema = z.object({
  id: z.string().min(1),
})
export type FriendIdInput = z.infer<typeof friendIdSchema>

export const upsertFriendSchema = z
  .object({
    id: z.string().min(1).optional(),
    website: z.string().trim().min(1).max(80),
    description: optionalText(999),
    homepage: z.url().max(500),
    poster: z.string().trim().min(1).max(500),
    rssUrl: z
      .union([z.url().max(500), z.literal(''), z.null()])
      .optional()
      .transform((value) => (value === null || value === undefined || value === '' ? undefined : value)),
    visible: z.boolean().optional().default(true),
  })
  .superRefine((input, context) => {
    const expected = friendPosterStoragePath(input.homepage)
    if (expected !== null && friendPosterStoragePathFromUrl(input.poster) !== expected) {
      context.addIssue({
        code: 'custom',
        message: 'friends.error.posterUploadRequired',
        path: ['poster'],
      })
    }
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

const friendApplyHoneypot = honeypotField('contact')

const optionalHttpUrl = () =>
  z
    .union([z.url().max(500).refine(isHttpUrl, { message: HTTP_URL_MESSAGE }), z.literal('')])
    .optional()
    .transform((value) => (value === undefined || value === '' ? undefined : value))

export const applyFriendSchema = z
  .object({
    website: z.string().trim().min(1).max(80),
    homepage: z.url().max(500).refine(isHttpUrl, { message: HTTP_URL_MESSAGE }),
    description: optionalText(999),
    poster: optionalHttpUrl(),
    rssUrl: optionalHttpUrl(),
    contact: friendApplyHoneypot.schema,
  })
  .superRefine(friendApplyHoneypot.refine)
export type ApplyFriendInput = z.input<typeof applyFriendSchema>

export const friendsApplyOutputSchema = okDto
