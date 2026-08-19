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
