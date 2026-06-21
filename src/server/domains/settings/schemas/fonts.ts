import { z } from 'zod'

/**
 * Font family name validation.
 *
 * Accepts names that are valid as the value of a CSS `font-family` property:
 *   - Simple CSS identifiers: `OPPOSans`, `Noto-Serif`, `my_font`
 *   - Identifiers containing spaces (quoted at use site): `OPPO Serif SC`,
 *     `Source Han Sans`
 *   - Non-ASCII / Unicode names: `思源宋体`, `ヒラギノ角ゴ`
 *   - Empty string (means "use the default font")
 *
 * Rejects anything that would break out of the CSS string context in which
 * the name is injected (root.tsx wraps it in single quotes). The regex
 * covers all printable characters except quotes, backslashes, semicolons,
 * and braces. The `trim()` + `min(1)` pair means whitespace-only names
 * normalize to empty.
 *
 * Used by:
 *   - `og` / `calendar` (canvas server-side rendering via @napi-rs/canvas)
 *   - `globalFamily` (site-wide UI sans-serif, injected as --font-body)
 *   - `postFamily` (article body serif, injected as --inkling-font-serif)
 */
const fontFamilySchema = z.union([
  z.literal(''),
  z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[^"'\\;{}]+$/u, {
      message: 'font-family must not contain quotes, backslashes, or braces',
    }),
])

// CSS list cap: 8 stylesheets per slot is comfortably above any
// realistic font number (typically 1-3) and stops a misconfigured row
// from emitting hundreds of <link> tags. The form trims empty strings
// before save.
const fontCssListSchema = z.array(z.url()).max(8)

export const fontsSchema = z.object({
  og: z.object({ family: fontFamilySchema }),
  calendar: z.object({ family: fontFamilySchema }),
  globalFamily: fontFamilySchema,
  postFamily: fontFamilySchema,
  globalCss: fontCssListSchema,
  postCss: fontCssListSchema,
})
export type FontsInput = z.infer<typeof fontsSchema>
