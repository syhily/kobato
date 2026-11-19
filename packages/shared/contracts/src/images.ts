import { idString, isoDateTime } from '@kobato/contracts/primitives.ts'
import { z } from 'zod'

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined || value === '' ? undefined : value))

export const uploadImageMetadataSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('generic'),
    note: optionalTrimmed(2000),
  }),
  z.object({
    kind: z.literal('category'),
    slug: z.string().trim().min(1).max(80),
    note: optionalTrimmed(2000),
  }),
  z.object({
    kind: z.literal('friend'),
    host: z.string().trim().min(1).max(253),
    note: optionalTrimmed(2000),
  }),
])

export type UploadImageMetadata = z.infer<typeof uploadImageMetadataSchema>

export const adminImagesListInput = z.object({
  q: z.string().optional(),
  kind: z.enum(['generic', 'category', 'friend', 'all']).optional(),
  offset: z.number().optional(),
  limit: z.number().optional(),
})
export type AdminImagesListInput = z.infer<typeof adminImagesListInput>

export const adminImageIdInput = z.object({ id: z.string().min(1) })
export type AdminImageIdInput = z.infer<typeof adminImageIdInput>

export const adminImageNoteInput = z.object({ id: z.string().min(1), note: z.string().nullable().optional() })
export type AdminImageNoteInput = z.infer<typeof adminImageNoteInput>

// oRPC serializes `Blob` inputs as multipart/form-data natively — the upload
// dialog's `File` passes straight through.
export const adminImageUploadInput = z.object({
  file: z.instanceof(Blob),
  metadata: uploadImageMetadataSchema,
})
export type AdminImageUploadInput = z.infer<typeof adminImageUploadInput>

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

export const adminImageMutationOutputDto = z.object({ image: adminImageDto })
export type AdminImageMutationOutput = z.infer<typeof adminImageMutationOutputDto>

export const imageResolveThumbhashInputSchema = z.object({ src: z.string().trim().min(1).max(2000) })
export type ImageResolveThumbhashInput = z.input<typeof imageResolveThumbhashInputSchema>

export const imageResolveThumbhashOutputSchema = z.object({
  thumbhash: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
})
export type ImageResolveThumbhashOutput = z.infer<typeof imageResolveThumbhashOutputSchema>
