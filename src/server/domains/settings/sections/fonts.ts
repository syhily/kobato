import { z } from 'zod'

import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

/** Custom validation message: typed id (mapped to a descriptor on write). */
export const fontsValidationMessages = {
  familyInvalid: 'admin.settings.fonts.error.familyInvalid',
} as const satisfies Record<string, UiMessageId>

/**
 * Font family name validation: CSS `font-family` values (spaced and Unicode names,
 * plus empty = "use the default font"). Must never break out of the single-quoted
 * CSS string it is injected into (root.tsx wraps it).
 */
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

// Ordered list of `font.id` UUIDs per slot (global / post / code), edited via
// `fonts.setSlot`; cap 8 stops runaway payloads. Slot membership is
// reference-counted across all three lists by the fonts domain.
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
