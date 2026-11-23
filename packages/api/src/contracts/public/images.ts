import { z } from 'zod'

export const imageResolveThumbhashInputSchema = z.object({ src: z.string().trim().min(1).max(2000) })
export type ImageResolveThumbhashInput = z.input<typeof imageResolveThumbhashInputSchema>

export const imageResolveThumbhashOutputSchema = z.object({
  thumbhash: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
})
export type ImageResolveThumbhashOutput = z.infer<typeof imageResolveThumbhashOutputSchema>
