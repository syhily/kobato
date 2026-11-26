import { resourceBinaryOkSchema, resourceNotModifiedSchema, safeBoolean } from '@kobato/api/contracts/primitives'
import { z } from 'zod'

export const brandingAssetInputSchema = z.object({
  path: z.string().max(2000),
  original: safeBoolean().optional(),
  ifNoneMatch: z.string().optional(),
})
export type BrandingAssetInput = z.input<typeof brandingAssetInputSchema>

export const brandingAssetOutputSchema = z.union([resourceNotModifiedSchema, resourceBinaryOkSchema])
export type BrandingAssetOutput = z.infer<typeof brandingAssetOutputSchema>
