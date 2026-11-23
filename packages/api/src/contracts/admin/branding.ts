import type { BrandingObjectRef } from '@kobato/settings/types'

import { fileSchema } from '@kobato/api/contracts/primitives'
import { z } from 'zod'

export const BRANDING_UPLOAD_MAX_BYTES = 2 * 1024 * 1024

export const adminBrandingClearInput = z.object({ slot: z.string() })
export type AdminBrandingClearInput = z.infer<typeof adminBrandingClearInput>

export const adminBrandingClearOutputDto = z.object({ slot: z.string(), success: z.boolean() })
export type AdminBrandingClearOutput = z.infer<typeof adminBrandingClearOutputDto>

export const adminBrandingUploadInput = z.object({ file: fileSchema, slot: z.string() })
export type AdminBrandingUploadInput = z.infer<typeof adminBrandingUploadInput>

export const adminBrandingUploadOutputDto = z.object({ slot: z.string(), ref: z.custom<BrandingObjectRef>() })
export type AdminBrandingUploadOutput = z.infer<typeof adminBrandingUploadOutputDto>
