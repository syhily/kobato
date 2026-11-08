import { z } from 'zod'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { AVATAR_SOURCES } from '@/shared/utils/avatar'
import { isAllowedMirrorUrl } from '@/shared/utils/safe-url'

/** Custom validation messages: typed UI-catalog ids (mapped to descriptors on write). */
export const commentsValidationMessages = {
  mirrorInvalid: 'admin.settings.comments.error.mirrorInvalid',
  duplicateSource: 'admin.settings.comments.error.duplicateSource',
} as const satisfies Record<string, UiMessageId>

export const commentsSchema = z.object({
  comments: z.object({
    size: z.coerce.number().int().min(1).max(100),
    avatar: z.object({
      mirror: z.url().refine(isAllowedMirrorUrl, commentsValidationMessages.mirrorInvalid),
      // Upstream fetch order; replace semantics on patch (the form always
      // submits the full permutation). Empty/duplicated chains are rejected.
      sources: z
        .array(z.enum(AVATAR_SOURCES))
        .min(1)
        .refine((sources) => new Set(sources).size === sources.length, commentsValidationMessages.duplicateSource)
        .default(['qq', 'github', 'gravatar']),
    }),
    // GitHub PAT for the Search API email lookup; encrypted at rest via
    // SECRET_FIELDS. Redaction blanks it to '' — keep '' valid here. Kept at
    // the bucket level because declareSecret addresses exactly one level.
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
