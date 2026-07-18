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
 * Used by `og` / `calendar` (canvas server-side rendering via
 * @napi-rs/canvas). The browser web fonts now come from self-hosted
 * packages managed in `/admin/library/fonts`; their `familyName` is stored on the
 * `font` row and never re-enters the settings row.
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

// Ordered list of `font.id` UUIDs assigned to a slot (global / post / code).
// The `/admin/library/fonts` manager edits these via `fonts.setSlot`. The cap of 8
// is comfortably above any realistic stack (typically 1-3) and stops a
// runaway payload from emitting hundreds of <link> tags. Slot membership is
// reference-counted across all three lists by the fonts domain — a font is
// only garbage-collected when its total reference count drops to zero.
const slotFontListSchema = z.array(z.uuid()).max(8)

export const fontsSchema = z.object({
  og: z.object({ family: fontFamilySchema }),
  calendar: z.object({ family: fontFamilySchema }),
  global: slotFontListSchema,
  post: slotFontListSchema,
  code: slotFontListSchema,
})
