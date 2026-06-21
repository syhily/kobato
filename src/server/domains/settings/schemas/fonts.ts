import { z } from 'zod'

// Font family name used by `@napi-rs/canvas` (`ctx.font` and
// `GlobalFonts.register`). Empty = not configured; non-empty must be
// a valid CSS identifier-like string (no spaces, no special chars).
const fontFamilySchema = z.union([
  z.literal(''),
  z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[\w-]+$/),
])

// CSS list cap: 8 stylesheets per slot is comfortably above any
// realistic font count (typically 1-3) and stops a misconfigured row
// from emitting hundreds of <link> tags. The form trims empty strings
// before save.
const fontCssListSchema = z.array(z.url()).max(8)

export const fontsSchema = z.object({
  og: z.object({ family: fontFamilySchema }),
  calendar: z.object({ family: fontFamilySchema }),
  postFamily: fontFamilySchema,
  globalCss: fontCssListSchema,
  postCss: fontCssListSchema,
})
export type FontsInput = z.infer<typeof fontsSchema>
