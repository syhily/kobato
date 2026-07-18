import { z } from 'zod'

import { isAllowedMirrorUrl } from '@/shared/utils/safe-url'

export const commentsSchema = z.object({
  comments: z.object({
    size: z.coerce.number().int().min(1).max(100),
    avatar: z.object({
      mirror: z.url().refine(isAllowedMirrorUrl, '镜像地址必须是已知的 Gravatar 镜像 HTTPS URL'),
      size: z.coerce.number().int().min(16).max(512),
    }),
    tokenTtlSeconds: z.coerce.number().int().min(60).max(86400).default(1800),
  }),
})
