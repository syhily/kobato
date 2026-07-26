import { z } from 'zod'

import { isAllowedMirrorUrl } from '@/shared/utils/safe-url'

export const commentsSchema = z.object({
  comments: z.object({
    size: z.coerce.number().int().min(1).max(100),
    avatar: z.object({
      mirror: z.url().refine(isAllowedMirrorUrl, '镜像地址必须是已知的 Gravatar 镜像 HTTPS URL'),
    }),
    tokenTtlSeconds: z.coerce.number().int().min(60).max(86400).default(1800),
  }),
})

export const commentsDefaults = {
  comments: {
    size: 10,
    avatar: { mirror: 'https://www.gravatar.com/avatar' },
    tokenTtlSeconds: 1800,
  },
} as const

export const commentsSection = {
  scope: 'blog.comments',
  key: 'comments',
  schema: commentsSchema,
  defaults: commentsDefaults,
} as const
