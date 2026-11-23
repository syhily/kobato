import { z } from 'zod'

export const avatarFindInputSchema = z.object({ email: z.email() })
export const avatarFindOutputSchema = z.object({ avatar: z.string() })

export type FindAvatarInput = z.input<typeof avatarFindInputSchema>

export type FindAvatarOutput = z.infer<typeof avatarFindOutputSchema>
