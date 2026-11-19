import { canonicalContentLanguage } from '@kobato/i18n/content-language.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'

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
