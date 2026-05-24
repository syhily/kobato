import { z } from 'zod'

// Empty string (Canvas slots) / empty array (CSS slots) == "not
// configured"; every consumer degrades silently. Non-empty paths must be
// relative — absolute paths and traversal segments (`..`) are rejected so
// an admin cannot point the renderer at unintended files on the SSR host.
const fontPathSchema = z.union([
  z.literal(''),
  z
    .string()
    .max(200)
    .regex(/^[^/].*$/, { message: '路径必须是相对的（不能以 / 开头）' })
    .refine((v) => !v.split('/').includes('..'), { message: '路径不能包含父目录引用（..）' }),
])

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
  og: z.object({ path: fontPathSchema, family: fontFamilySchema }),
  calendar: z.object({ path: fontPathSchema, family: fontFamilySchema }),
  globalCss: fontCssListSchema,
  postCss: fontCssListSchema,
})
export type FontsInput = z.infer<typeof fontsSchema>
