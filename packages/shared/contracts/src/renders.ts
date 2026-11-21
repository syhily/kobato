import type { ErrorMessageDescriptor } from '@kobato/contracts/api-error'

import { z } from 'zod'

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
