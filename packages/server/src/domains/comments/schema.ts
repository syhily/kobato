import { z } from 'zod'

export const loadAllCommentsSchema = z.object({
  offset: z.number().min(0),
  limit: z.number().min(1).max(100),
  pageKey: z.string().optional(),
  userId: z.string().optional(),
  status: z.enum(['all', 'pending', 'approved']).optional(),
  q: z.string().trim().max(200).optional(),
  match: z.enum(['contains', 'does-not-contain']).optional(),
  createdAfter: z.iso.datetime().optional(),
  createdBefore: z.iso.datetime().optional(),
})
export type LoadAllCommentsInput = z.infer<typeof loadAllCommentsSchema>

export const filterAutocompleteSchema = z.object({
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  ids: z
    .string()
    .max(400)
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    ),
  key: z.string().max(2048).optional(),
})
export type FilterAutocompleteInput = z.infer<typeof filterAutocompleteSchema>
