import { z } from 'zod'

import { SOCIAL_NETWORK_META, SOCIAL_NETWORKS } from '@/shared/config/socials'
import { httpUrlOrEmptyStringSchema } from '@/shared/utils/safe-url'

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
          message: `「${SOCIAL_NETWORK_META[row.network].label}」固定使用 \`${expectedType}\` 展示方式`,
        })
      }
      if (seen.has(row.network)) {
        ctx.addIssue({
          code: 'custom',
          path: ['socials', index, 'network'],
          message: `「${SOCIAL_NETWORK_META[row.network].label}」已经添加过，请直接编辑已有那条`,
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
