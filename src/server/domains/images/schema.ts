import { z } from 'zod'

const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined || value === '' ? undefined : value))

export const listImagesSchema = z.object({
  q: z.string().trim().max(200).optional(),
  kind: z.enum(['generic', 'category', 'friend', 'all']).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

export const deleteImageSchema = z.object({
  id: z.string().min(1),
})

export const updateImageNoteSchema = z.object({
  id: z.string().min(1),
  note: z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null) {
        return null
      }
      const trimmed = value.trim()
      return trimmed === '' ? null : trimmed
    }),
})

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

export const recalculateThumbhashSchema = z.object({
  id: z.string().min(1),
})

export type UploadImageMetadata = z.infer<typeof uploadImageMetadataSchema>
