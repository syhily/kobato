import { z } from 'zod'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { SOCIAL_NETWORK_META, SOCIAL_NETWORKS } from '@/shared/config/socials'
import { httpUrlOrEmptyStringSchema } from '@/shared/utils/safe-url'

/** Custom validation messages: typed ids; provider names ride `params`, never translated. */
export const socialsValidationMessages = {
  fixedType: 'admin.settings.socials.error.fixedType',
  duplicateNetwork: 'admin.settings.socials.error.duplicateNetwork',
} as const satisfies Record<string, UiMessageId>

// Schema-level guard: `type` is forced to the platform's canonical display mode and each
// platform may appear at most once — a hand-crafted payload could otherwise mix or duplicate rows.
export const socialsSchema = z
  .object({
    socials: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(60),
          network: z.enum(SOCIAL_NETWORKS),
          type: z.enum(['link', 'qrcode']),
          title: z.string().trim().max(120).optional(),
          link: httpUrlOrEmptyStringSchema,
        }),
      )
      .max(SOCIAL_NETWORKS.length),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>()
    value.socials.forEach((row, index) => {
      const expectedType = SOCIAL_NETWORK_META[row.network].type
      if (row.type !== expectedType) {
        ctx.addIssue({
          code: 'custom',
          path: ['socials', index, 'type'],
          message: socialsValidationMessages.fixedType,
          params: { network: SOCIAL_NETWORK_META[row.network].brandName, type: expectedType },
        })
      }
      if (seen.has(row.network)) {
        ctx.addIssue({
          code: 'custom',
          path: ['socials', index, 'network'],
          message: socialsValidationMessages.duplicateNetwork,
          params: { network: SOCIAL_NETWORK_META[row.network].brandName },
        })
      } else {
        seen.add(row.network)
      }
    })
  })

export const socialsDefaults = { socials: [] } as const

export const socialsSection = {
  scope: 'blog.socials',
  key: 'socials',
  schema: socialsSchema,
  defaults: socialsDefaults,
} as const
