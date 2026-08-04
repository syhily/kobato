import { SOCIAL_NETWORKS } from '@kobato/shared/config/socials'
import { z } from 'zod'

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

export const navigationDefaults = { navigation: { sideNav: [], footerNav: [] } } as const

export const navigationSection = {
  scope: 'blog.navigation',
  key: 'navigation',
  schema: navigationSchema,
  defaults: navigationDefaults,
} as const
