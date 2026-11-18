import { canonicalContentLanguage } from '@kobato/i18n/content-language.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'

/**
 * Normalize an upsert's content language: `undefined` = leave untouched, blank /
 * `null` = clear, a well-formed BCP 47 tag = its canonical spelling (not limited to
 * the four UI locales). Anything else rejects the write with a descriptor-carrying
 * `BAD_REQUEST` from this single authority. The wire field's structural shape and
 * the upsert-meta input base live in `@kobato/contracts/content-admin-base.ts`.
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
