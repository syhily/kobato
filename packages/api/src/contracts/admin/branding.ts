import { z } from 'zod'

export const adminBrandingClearInput = z.object({ slot: z.string() })
export type AdminBrandingClearInput = z.infer<typeof adminBrandingClearInput>

export const adminBrandingClearOutputDto = z.object({ slot: z.string(), success: z.boolean() })
export type AdminBrandingClearOutput = z.infer<typeof adminBrandingClearOutputDto>
