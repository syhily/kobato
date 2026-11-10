import { describe, expect, it } from 'vitest'

import { resolveContentLanguage } from '@/server/domains/content/schemas/meta-fields'
import { upsertPageMetaSchema } from '@/server/domains/pages/schema'
import { upsertPostMetaSchema } from '@/server/domains/posts/schema'
import { DomainError } from '@/server/infra/http/errors'
import {
  CONTENT_LANGUAGE_MAX_LENGTH,
  canonicalContentLanguage,
  isContentLanguageInput,
} from '@/shared/i18n/content-language'

// The content language is author metadata, not a UI locale: any well-formed BCP 47 tag
// is legal, `SUPPORTED_LOCALES` is not a closed set, and blank stays "unset" (rendered
// without a `lang` attribute).

describe('shared/i18n/content-language — canonicalization', () => {
  it('canonicalizes case and script subtags', () => {
    expect(canonicalContentLanguage('zh-hant-tw')).toBe('zh-Hant-TW')
    expect(canonicalContentLanguage('  ja  ')).toBe('ja')
    expect(canonicalContentLanguage('fr-ca')).toBe('fr-CA')
  })

  it('accepts tags outside the four UI locales', () => {
    for (const tag of ['ja', 'ko-KR', 'pt-BR', 'ar-EG', 'zh-Hant-TW-u-nu-hanidec']) {
      expect(canonicalContentLanguage(tag)).not.toBeNull()
      expect(isContentLanguageInput(tag)).toBe(true)
    }
  })

  it('treats blank / null / undefined as unset', () => {
    expect(canonicalContentLanguage('')).toBeNull()
    expect(canonicalContentLanguage('   ')).toBeNull()
    expect(canonicalContentLanguage(null)).toBeNull()
    expect(canonicalContentLanguage(undefined)).toBeNull()
    expect(isContentLanguageInput('')).toBe(true)
  })

  it('rejects malformed tags', () => {
    for (const tag of ['zh_CN', 'not a tag', 'x', 'i-klingon', '123']) {
      expect(canonicalContentLanguage(tag)).toBeNull()
      expect(isContentLanguageInput(tag)).toBe(false)
    }
  })
})

describe('content meta-fields — resolveContentLanguage', () => {
  it('passes undefined through (update leaves the column untouched)', () => {
    expect(resolveContentLanguage(undefined)).toBeUndefined()
  })

  it('maps null and blank to an explicit clear', () => {
    expect(resolveContentLanguage(null)).toBeNull()
    expect(resolveContentLanguage('  ')).toBeNull()
  })

  it('returns the canonical spelling of a valid tag', () => {
    expect(resolveContentLanguage('zh-hant-tw')).toBe('zh-Hant-TW')
  })

  it('rejects a malformed tag with a descriptor-carrying BAD_REQUEST', () => {
    try {
      resolveContentLanguage('zh_CN')
      expect.unreachable('resolveContentLanguage should throw')
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError)
      const domainError = error as DomainError
      expect(domainError.code).toBe('BAD_REQUEST')
      expect(domainError.descriptor?.messageKey).toBe('admin.editor.contentLanguage.error')
      expect(domainError.issues).toEqual([
        expect.objectContaining({ messageKey: 'admin.editor.contentLanguage.error', path: ['contentLanguage'] }),
      ])
    }
  })
})

describe('content upsert schemas — contentLanguage field', () => {
  it.each([
    ['post', upsertPostMetaSchema],
    ['page', upsertPageMetaSchema],
  ])('%s accepts null, omission and any bounded tag', (_entity, schema) => {
    expect(schema.parse({ title: 'T', contentLanguage: null }).contentLanguage).toBeNull()
    expect(schema.parse({ title: 'T' }).contentLanguage).toBeUndefined()
    expect(schema.parse({ title: 'T', contentLanguage: '  ja ' }).contentLanguage).toBe('ja')
  })

  it.each([
    ['post', upsertPostMetaSchema],
    ['page', upsertPageMetaSchema],
  ])('%s leaves the grammar/descriptor decision to the mutation, not the schema', (_entity, schema) => {
    // Structural only: an over-long value is a schema failure, a malformed
    // tag reaches `resolveContentLanguage` so the wire carries a descriptor.
    const tooLong = 'a'.repeat(CONTENT_LANGUAGE_MAX_LENGTH + 1)
    expect(schema.safeParse({ title: 'T', contentLanguage: tooLong }).success).toBe(false)
    expect(schema.safeParse({ title: 'T', contentLanguage: 'zh_CN' }).success).toBe(true)
  })
})
