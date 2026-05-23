import { z } from 'zod'

import { SOCIAL_NETWORKS } from '@/shared/config/socials'

export const navigationSchema = z.object({
  navigation: z.object({
    sideNav: z
      .array(
        z.object({
          text: z.string().trim().min(1).max(40),
          link: z.string().trim().min(1).max(200),
          target: z.string().trim().max(20).optional(),
        }),
      )
      .max(20),
    footerNav: z
      .array(
        z.object({
          type: z.enum(['social', 'themeToggle', 'search']),
          network: z.enum(SOCIAL_NETWORKS).optional(),
        }),
      )
      .max(5),
  }),
})
export type NavigationInput = z.infer<typeof navigationSchema>
