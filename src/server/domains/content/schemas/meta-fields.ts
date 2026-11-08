import { z } from 'zod'

import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { DomainError } from '@/server/infra/http/errors'
import { CONTENT_LANGUAGE_MAX_LENGTH, canonicalContentLanguage } from '@/shared/i18n/content-language'
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

/**
 * Structural shape of the writable content-language field only. The BCP 47
 * grammar check runs in {@link resolveContentLanguage}: oRPC input-schema
 * failures travel outside the descriptor channel, while the mutation's
 * `DomainError` ships the editor's catalog id plus the `contentLanguage` path.
 */
export const contentLanguageField = z.string().trim().max(CONTENT_LANGUAGE_MAX_LENGTH).nullable().optional()

/**
 * Normalize an upsert's content language: `undefined` = leave untouched,
 * blank / `null` = clear, any well-formed BCP 47 tag = its canonical spelling
 * (NOT limited to the four UI locales). Anything else rejects the write with a
 * descriptor-carrying `BAD_REQUEST`, so both entities and every caller share
 * one authority.
 */
export function resolveContentLanguage(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null || value.trim() === '') {
    return value === undefined ? undefined : null
  }
  const canonical = canonicalContentLanguage(value)
  if (canonical === null) {
    const descriptor = descriptorFor('admin.editor.contentLanguage.error')
    throw new DomainError('BAD_REQUEST', descriptor, [{ ...descriptor, code: 'custom', path: ['contentLanguage'] }])
  }
  return canonical
}

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value ?? '')

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
  contentLanguage: contentLanguageField,
  // `null` = explicit cancel-schedule; omitted = leave the column untouched.
  publishedAt: z.iso.datetime({ offset: true }).nullable().optional(),
})
