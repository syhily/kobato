import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { coerceBoolean } from '@kobato/settings/sections/shared'
import { z } from 'zod'

export const sidebarValidationMessages = {
  customQuotesTooFew: 'admin.settings.sidebar.error.customQuotesTooFew',
} as const satisfies Record<string, UiMessageId>

export const sidebarSchema = z.object({
  sidebar: z.object({
    widgets: z.array(
      z.object({
        type: z.enum(['search', 'recentPosts', 'recentComments', 'randomTags', 'todayCalendar']),
        enabled: coerceBoolean,
        count: z.coerce.number().int().min(0).max(100).optional(),
      }),
    ),
    dailyQuote: z
      .object({
        source: z.enum(['shanbay', 'one', 'hitokoto', 'custom', 'local']).default('shanbay'),
        customQuotes: z
          .array(
            z.object({
              content: z.string().trim().min(1).max(100),
              author: z.string().trim().max(30).default(''),
            }),
          )
          .max(500)
          .refine((arr) => arr.length === 0 || arr.length >= 10, sidebarValidationMessages.customQuotesTooFew)
          .default([]),
      })
      .default({ source: 'shanbay', customQuotes: [] }),
  }),
})

export const sidebarDefaults = {
  sidebar: {
    widgets: [
      { type: 'search' as const, enabled: false },
      { type: 'recentPosts' as const, enabled: false, count: 5 },
      { type: 'recentComments' as const, enabled: false, count: 5 },
      { type: 'randomTags' as const, enabled: false, count: 20 },
      { type: 'todayCalendar' as const, enabled: false },
    ],
    dailyQuote: { source: 'shanbay' as const, customQuotes: [] },
  },
} as const

export const sidebarSection = {
  scope: 'blog.sidebar',
  key: 'sidebar',
  schema: sidebarSchema,
  defaults: sidebarDefaults,
} as const
