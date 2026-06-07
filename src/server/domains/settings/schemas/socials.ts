import { z } from 'zod'

import { SOCIAL_NETWORK_META, SOCIAL_NETWORKS } from '@/shared/config/socials'
import { httpUrlOrEmptyStringSchema } from '@/shared/utils/safe-url'

// Each row is pinned to a platform from the closed `SOCIAL_NETWORKS`
// list, and the display `type` is forced to the canonical type for that
// platform (WeChat / QQ → qrcode, others → link). The admin form only
// surfaces these as a fixed badge — the schema is the second line of
// defence against a hand-crafted payload that tries to mix and match.
//
// The `superRefine` then enforces uniqueness so every platform appears
// platforms, but a stale tab or a direct API call could otherwise sneak
// duplicates past the UI.
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
export type SocialsInput = z.infer<typeof socialsSchema>
