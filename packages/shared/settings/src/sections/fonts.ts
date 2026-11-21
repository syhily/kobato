import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { z } from 'zod'

export const fontsValidationMessages = {
  familyInvalid: 'admin.settings.fonts.error.familyInvalid',
} as const satisfies Record<string, UiMessageId>

const fontFamilySchema = z.union([
  z.literal(''),
  z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[^"'\\;{}]+$/u, {
      message: fontsValidationMessages.familyInvalid,
    }),
])

const slotFontListSchema = z.array(z.uuid()).max(8)

export const fontsSchema = z.object({
  og: z.object({ family: fontFamilySchema }),
  calendar: z.object({ family: fontFamilySchema }),
  global: slotFontListSchema,
  post: slotFontListSchema,
  code: slotFontListSchema,
})

export const fontsDefaults = {
  og: { family: 'NotoSansCJK' },
  calendar: { family: 'NotoSansCJK' },
  global: [],
  post: [],
  code: [],
} as const

export const fontsSection = {
  scope: 'blog.fonts',
  key: 'fonts',
  schema: fontsSchema,
  defaults: fontsDefaults,
} as const
