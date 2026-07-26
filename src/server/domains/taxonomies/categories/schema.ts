import { z } from 'zod'

// Helper: trim incoming text. Used for `description` so a blank
// textarea collapses to "" (the column has `NOT NULL DEFAULT ''`).
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value ?? '')

// `slug()` enforces the same kebab-case-ASCII shape `deriveSlug`
// produces, so URLs stay legal regardless of which authoring channel
// produced the row (CLI seeder, admin form, or auto-derived from the
// category name when the form leaves it blank).
const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i, 'Invalid slug')

export const listCategoriesSchema = z.object({
  q: z.string().trim().max(100).optional(),
})

export const categoryIdSchema = z.object({
  id: z.string().min(1),
})

export const upsertCategorySchema = z.object({
  // Optional — present means update, absent means create. Stringified
  // bigint matches the wire format used by the rest of the admin
  // surfaces (`AdminUserDto.id`, `AdminFriendDto.id`, …).
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(20),
  // `slug` is optional on the wire; the service derives it via
  // `deriveSlug(name)` (pinyin-pro -> github-slugger) when blank,
  // matching the tag flow so admins can always rely on "leave blank
  // to auto-derive".
  slug: slugSchema.optional(),
  cover: z.url().max(500),
  description: optionalText(999),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional().default(0),
})

// Drag-to-reorder payload. `orderedIds` is the full list of category
// ids the admin saw when the drop happened, in the order they should
// appear after the drop. The service validates that the set is
// identical to the live row set (no add / drop) before rewriting any
// `sort_order`, so a stale or partial submission is rejected with
// HTTP 400 instead of silently destroying ordering for unseen rows.
export const reorderCategoriesSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1).max(500),
})
