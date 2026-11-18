import { z } from 'zod'

// The public comment wire schemas (`commentReplySchema` / `commentRidSchema` /
// `commentEditInputSchema` / the list/token/own-edit family) live in
// `@kobato/contracts/comments.ts` — the single Zod source the `@kobato/api`
// comments contract composes. This module keeps the server-side-only inputs.

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

// Server-side autocomplete inputs for the moderation Combobox filters.
// `ids` rehydrates a selection from `?userId=` (comma-separated); `key` is
// the single-value page-key equivalent (page keys may contain `,`).
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
