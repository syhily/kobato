import {
  resourceBinaryOkSchema,
  resourceNotModifiedSchema,
  resourceRedirectSchema,
} from '@kobato/api/contracts/primitives'
import { z } from 'zod'

export const imageResolveThumbhashInputSchema = z.object({ src: z.string().trim().min(1).max(2000) })
export type ImageResolveThumbhashInput = z.input<typeof imageResolveThumbhashInputSchema>

export const imageResolveThumbhashOutputSchema = z.object({
  thumbhash: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
})
export type ImageResolveThumbhashOutput = z.infer<typeof imageResolveThumbhashOutputSchema>

export const ogImageInputSchema = z.object({
  slug: z.string().max(2000),
  category: z.boolean().optional(),
})
export type OgImageInput = z.input<typeof ogImageInputSchema>

export const calendarImageInputSchema = z.object({
  year: z.string(),
  time: z.string(),
  theme: z.enum(['light', 'dark']),
  ifNoneMatch: z.string().optional(),
})
export type CalendarImageInput = z.input<typeof calendarImageInputSchema>

export const ogImageOutputSchema = z.union([resourceRedirectSchema, resourceBinaryOkSchema])
export type OgImageOutput = z.infer<typeof ogImageOutputSchema>

export const calendarImageOutputSchema = z.union([resourceNotModifiedSchema, resourceBinaryOkSchema])
export type CalendarImageOutput = z.infer<typeof calendarImageOutputSchema>
