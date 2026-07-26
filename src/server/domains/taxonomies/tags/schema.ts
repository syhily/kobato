import { z } from 'zod'

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i, 'Invalid slug')

// `offset` / `limit` are coerced from query strings (the action is a
// GET and query params serialise numbers via `String(value)`).
// Hard upper bound on `limit` matches the moderation list (100) so a
// hostile caller can't request 10k rows in one shot; the client only
// ever picks from {10, 20, 50, 100}. `offset` has no upper bound
// because legitimate paging at page=N*pageSize can grow with the tag
// catalogue, but we still guard against negatives.
export const listTagsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

export const tagIdSchema = z.object({
  id: z.string().min(1),
})

// `slug` is optional on the wire; the service derives it via
// `pinyin-pro` when blank.
export const upsertTagSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(20),
  slug: slugSchema.optional(),
})
