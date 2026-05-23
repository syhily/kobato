import { z } from 'zod'

// Empty string (Canvas slots) / empty array (CSS slots) == "not
// configured"; every consumer degrades silently. Non-empty URLs must
// parse as absolute — relative paths and `file://` would let an admin
// point the renderer at unintended files on the SSR host.
const fontUrlSchema = z.union([z.literal(''), z.url()])
// CSS list cap: 8 stylesheets per slot is comfortably above any
// realistic font count (typically 1-3) and stops a misconfigured row
// from emitting hundreds of <link> tags. The form trims empty strings
// before save.
const fontCssListSchema = z.array(z.url()).max(8)

export const fontsSchema = z.object({
  og: z.object({ url: fontUrlSchema }),
  calendar: z.object({ url: fontUrlSchema }),
  globalCss: fontCssListSchema,
  postCss: fontCssListSchema,
})
export type FontsInput = z.infer<typeof fontsSchema>
