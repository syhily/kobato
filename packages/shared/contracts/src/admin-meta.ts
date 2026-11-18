import { idString, isoDateTime, safeBoolean } from '@kobato/contracts/primitives.ts'
import { CONTENT_LANGUAGE_MAX_LENGTH } from '@kobato/i18n/content-language.ts'
import { z } from 'zod'

// Shared post/page admin wire pieces: the output DTO base below, the upsert
// input base, and the restore result both admin content controllers emit.

/**
 * Field-level zod pieces shared by the post and page admin upsert inputs. The
 * slug alphabet allows `[._-]` between segments so legacy page URLs survive.
 */
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, 'Invalid slug')

/**
 * Structural shape of the writable content-language field only. The BCP 47
 * grammar check runs server-side in `resolveContentLanguage`: oRPC
 * input-schema failures travel outside the descriptor channel, while the
 * mutation's `DomainError` carries the catalog id plus the `contentLanguage`
 * path.
 */
export const contentLanguageField = z.string().trim().max(CONTENT_LANGUAGE_MAX_LENGTH).nullable().optional()

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value ?? '')

/**
 * Upsert-meta skeleton every content entity shares — the writable shared meta
 * columns; entity schemas `.extend()` it with their extras.
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
  contentLanguage: contentLanguageField,
  // `null` = explicit cancel-schedule; omitted = leave the column untouched.
  publishedAt: z.iso.datetime({ offset: true }).nullable().optional(),
})

// Shared restore outcome: `warning` carries the server-localized side-effect
// notices (image-library sync failures) for the editor to surface.
export const contentRestoreResultDto = z.object({ success: z.boolean(), warning: z.string().optional() })
export type ContentRestoreResult = z.infer<typeof contentRestoreResultDto>

// Fields every content entity (post / page) shares, projected from the shared
// meta columns. Bigint ids are stringified — the admin contract declares
// strings up front. Entity DTOs `.extend()` this base with their own fields.
export const adminMetaBaseDto = z.object({
  id: idString,
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  cover: z.string(),
  og: z.string().nullable(),
  published: z.boolean(),
  commentsEnabled: z.boolean(),
  webmentionsEnabled: z.boolean(),
  showToc: z.boolean(),
  // Opts the entity into rendering「修改于 XXXX」on the public detail page;
  // toggled from the editor meta sidebar, defaults `false`.
  showUpdated: z.boolean(),
  // Author-declared BCP 47 tag of the prose, CANONICALIZED on write (any
  // well-formed tag — not limited to the four UI locales). `null` renders no
  // `lang` on the body container, so it inherits the document language.
  contentLanguage: z.string().nullable(),
  publishedAt: isoDateTime,
  /** `null` while the entity has never been published. */
  publishedRevisionId: idString.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  /** When non-null the row is soft-deleted. */
  deletedAt: isoDateTime.nullable(),
  authorId: idString.nullable(),
  authorName: z.string().nullable(),
  // Approved comment count for the row's metric row. Populated by the admin
  // list endpoint; `0` on detail / save paths.
  commentCount: z.number().int().nonnegative(),
  // The row's `metric.public_id` UUID — the wire identifier the admin
  // comment-count link deep-links with. Empty on detail / save paths.
  commentPublicId: z.string(),
})
export type AdminMetaBaseDto = z.infer<typeof adminMetaBaseDto>
