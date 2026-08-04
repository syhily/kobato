import { safeBoolean } from '@kobato/shared/utils/schema'
import { z } from 'zod'

/**
 * Field-level zod pieces shared verbatim by the post and page admin
 * input schemas. Both entities accept the same user-supplied slug
 * alphabet (`[._-]` between segments) so legacy page URLs like
 * `archives.html` survive — see `src/server/AGENTS.md` "Slug derivation
 * and uniqueness".
 */
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, 'Invalid slug')

/** Optional free-text meta field: trims, caps length, defaults to ''. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value ?? '')

export const idSchema = z.object({ id: z.string().min(1) })

/**
 * The upsert-meta skeleton every content entity shares — the writable
 * shared meta columns. Entity schemas `.extend()` it with their extras
 * (`upsertPostMetaSchema`: visible/pinnedAt/categoryId/tags/alias;
 * `upsertPageMetaSchema`: showFriends). Both entities accept the same
 * user-supplied slug alphabet via `slugSchema`.
 */
export const upsertMetaBaseSchema = z.object({
  id: z.string().min(1).optional(),
  slug: slugSchema.optional(),
  title: z.string().trim().min(1).max(200),
  summary: optionalText(500),
  cover: z.string().trim().max(500).optional().default(''),
  og: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((value) => (value === undefined || value === '' ? null : value)),
  published: safeBoolean().optional(),
  commentsEnabled: safeBoolean().optional(),
  webmentionsEnabled: safeBoolean().optional(),
  showToc: safeBoolean().optional(),
  showUpdated: safeBoolean().optional(),
  // `null` is the explicit cancel-schedule signal (vs omitted = leave the
  // column untouched) — see `update` in `content/entities/mutate.ts`.
  publishedAt: z.iso.datetime({ offset: true }).nullable().optional(),
})
