import { idString, isoDateTime } from '@kobato/shared/contracts/primitives'
import { z } from 'zod'

export const adminImageDto = z.object({
  id: idString,
  kind: z.enum(['generic', 'category', 'friend']),
  storagePath: z.string(),
  publicUrl: z.string(),
  mimeType: z.string(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  byteSize: z.number().int().nonnegative(),
  thumbhash: z.string().nullable(),
  uploaderId: idString.nullable(),
  /** Display name of the user who uploaded the image. */
  uploaderName: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type AdminImageDto = z.infer<typeof adminImageDto>

export const listImagesOutputDto = z.object({
  images: z.array(adminImageDto),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
})
export type ListImagesOutput = z.infer<typeof listImagesOutputDto>
