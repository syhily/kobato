import { resourceBinaryOkSchema, resourceRedirectSchema } from '@kobato/api/contracts/primitives'
import { z } from 'zod'

export const avatarFindInputSchema = z.object({ email: z.email() })
export const avatarFindOutputSchema = z.object({ avatar: z.string() })

export type FindAvatarInput = z.input<typeof avatarFindInputSchema>

export type FindAvatarOutput = z.infer<typeof avatarFindOutputSchema>

export const avatarImageInputSchema = z.object({
  hash: z.string().max(2000),
  size: z.string().optional(),
})
export type AvatarImageInput = z.input<typeof avatarImageInputSchema>

export const avatarImageOutputSchema = z.union([resourceRedirectSchema, resourceBinaryOkSchema])
export type AvatarImageOutput = z.infer<typeof avatarImageOutputSchema>
