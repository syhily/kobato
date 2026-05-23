import { z } from 'zod'

export const commentsSchema = z.object({
  comments: z.object({
    size: z.coerce.number().int().min(1).max(100),
    avatar: z.object({
      mirror: z.url(),
      size: z.coerce.number().int().min(16).max(512),
    }),
    tokenTtlSeconds: z.coerce.number().int().min(60).max(86400).default(1800),
  }),
})
export type CommentsInput = z.infer<typeof commentsSchema>
