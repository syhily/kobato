import { z } from 'zod'

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
