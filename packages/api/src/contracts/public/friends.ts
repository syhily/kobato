import { honeypotField, okDto } from '@kobato/api/contracts/primitives'
import { isHttpUrl } from '@kobato/base/utils/safe-url'
import { HTTP_URL_MESSAGE } from '@kobato/base/utils/url-schema'
import { z } from 'zod'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value === null || value === undefined || value === '' ? undefined : value))

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
