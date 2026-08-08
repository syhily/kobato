import { z } from 'zod'

import { safeBoolean } from '@/shared/utils/schema'

/**
 * Field-level zod pieces shared by the post and page admin input
 * schemas. The slug alphabet allows `[._-]` between segments so legacy
 * page URLs like `archives.html` survive.
 */
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, 'Invalid slug')

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
 * shared meta columns; entity schemas `.extend()` it with their extras.
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
  // `null` = explicit cancel-schedule; omitted = leave the column untouched.
  publishedAt: z.iso.datetime({ offset: true }).nullable().optional(),
})
