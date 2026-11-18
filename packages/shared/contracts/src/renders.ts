import type { ErrorMessageDescriptor } from '@kobato/contracts/api-error.ts'

import { z } from 'zod'

// Admin renders wire — the single Zod source the `@kobato/api` renders
// contract composes and the server validates against. `math` is the editor's
// KaTeX preview; the two batch cursors drive the dashboard rebuild buttons.

export const adminRenderMathInput = z.object({
  tex: z.string().max(10_000),
  display: z.boolean().optional(),
})
export type AdminRenderMathInput = z.infer<typeof adminRenderMathInput>

export const adminRenderMathOutputDto = z.object({
  mathml: z.string(),
  error: z.custom<ErrorMessageDescriptor>().nullable(),
})
export type AdminRenderMathOutput = z.infer<typeof adminRenderMathOutputDto>

export const adminRenderBatchInput = z.object({ offset: z.number().optional(), batchSize: z.number().optional() })
export type AdminRenderBatchInput = z.infer<typeof adminRenderBatchInput>

export const adminRenderReindexOutputDto = z.object({
  processed: z.number(),
  failed: z.number(),
  total: z.number(),
  nextOffset: z.number().nullable(),
})
export type AdminRenderReindexOutput = z.infer<typeof adminRenderReindexOutputDto>

export const adminRenderReprojectOutputDto = z.object({
  processed: z.number(),
  failed: z.number(),
  rewritten: z.number(),
  total: z.number(),
  nextOffset: z.number().nullable(),
})
export type AdminRenderReprojectOutput = z.infer<typeof adminRenderReprojectOutputDto>
