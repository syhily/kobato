import { z } from 'zod'

import { coerceBoolean } from '@/server/domains/settings/schemas/shared'

export const sidebarSchema = z.object({
  sidebar: z.object({
    widgets: z.array(
      z.object({
        type: z.enum(['search', 'recentPosts', 'recentComments', 'randomTags', 'todayCalendar']),
        enabled: coerceBoolean,
        count: z.coerce.number().int().min(0).max(100).optional(),
      }),
    ),
    // Daily-quote source for the calendar image (`todayCalendar` widget).
    // Remote sources fall back to the built-in bank on failure; `custom`
    // needs ≥ 10 uploaded quotes or it silently behaves like `local`.
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
          .refine((arr) => arr.length === 0 || arr.length >= 10, '自定义一言至少需要 10 条，或清空后使用内置一言库')
          .default([]),
      })
      .default({ source: 'shanbay', customQuotes: [] }),
  }),
})
