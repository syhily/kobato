import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { AVATAR_SOURCES } from '@kobato/base/assets/avatar'
import { isAllowedMirrorUrl } from '@kobato/base/assets/gravatar'
import { z } from 'zod'

export const commentsValidationMessages = {
  mirrorInvalid: 'admin.settings.comments.error.mirrorInvalid',
  duplicateSource: 'admin.settings.comments.error.duplicateSource',
} as const satisfies Record<string, UiMessageId>

export const commentsSchema = z.object({
  comments: z.object({
    size: z.coerce.number().int().min(1).max(100),
    avatar: z.object({
      mirror: z.url().refine(isAllowedMirrorUrl, commentsValidationMessages.mirrorInvalid),
      sources: z
        .array(z.enum(AVATAR_SOURCES))
        .min(1)
        .refine((sources) => new Set(sources).size === sources.length, commentsValidationMessages.duplicateSource)
        .default(['qq', 'github', 'gravatar']),
    }),
    githubToken: z.string().max(255).optional(),
    tokenTtlSeconds: z.coerce.number().int().min(60).max(86400).default(1800),
  }),
})

export const commentsDefaults = {
  comments: {
    size: 10,
    avatar: { mirror: 'https://www.gravatar.com/avatar', sources: ['qq', 'github', 'gravatar'] },
    tokenTtlSeconds: 1800,
  },
} as const

export const commentsSection = {
  scope: 'blog.comments',
  key: 'comments',
  schema: commentsSchema,
  defaults: commentsDefaults,
} as const
