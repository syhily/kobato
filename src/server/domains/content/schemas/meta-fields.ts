import { z } from 'zod'

/**
 * Field-level zod pieces shared verbatim by the post and page admin
 * input schemas. Both entities accept the same user-supplied slug
 * alphabet (`[._-]` between segments) so legacy page URLs like
 * `archives.html` survive — see `src/server/AGENTS.md` "Slug derivation
 * and uniqueness". Server-derived slugs stay plain kebab-case via
 * `@/server/infra/slug::deriveSlug`.
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
