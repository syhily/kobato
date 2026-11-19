import { idString, isoDateTime, safeBoolean } from '@kobato/contracts/primitives.ts'
import { CONTENT_LANGUAGE_MAX_LENGTH } from '@kobato/i18n/content-language.ts'
import { z } from 'zod'

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, 'Invalid slug')

export const contentLanguageField = z.string().trim().max(CONTENT_LANGUAGE_MAX_LENGTH).nullable().optional()

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value ?? '')

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
  publishedAt: z.iso.datetime({ offset: true }).nullable().optional(),
})

export const contentRestoreResultDto = z.object({ success: z.boolean(), warning: z.string().optional() })
export type ContentRestoreResult = z.infer<typeof contentRestoreResultDto>

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
  showUpdated: z.boolean(),
  contentLanguage: z.string().nullable(),
  publishedAt: isoDateTime,
  publishedRevisionId: idString.nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  deletedAt: isoDateTime.nullable(),
  authorId: idString.nullable(),
  authorName: z.string().nullable(),
  commentCount: z.number().int().nonnegative(),
  commentPublicId: z.string(),
})
export type AdminMetaBaseDto = z.infer<typeof adminMetaBaseDto>
