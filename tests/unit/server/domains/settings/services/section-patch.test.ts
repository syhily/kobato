import { describe, expect, it } from 'vitest'

import type { SettingsSection } from '@/shared/config/sections'

import { SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { assertSectionPatchKeys } from '@/server/domains/settings/services/section-patch'
import { DomainError } from '@/server/infra/http/errors'
import { SETTINGS_SECTIONS } from '@/shared/config/sections'

// Stand-ins for `meta.defaults` in the sections that ship none (`defaults: null`).
const FULL_GENERAL = {
  title: '雨帆',
  description: '记录与思考',
  website: 'https://example.com',
  keywords: ['blog'],
  author: { name: 'Yufan', email: 'a@b.co', url: 'https://example.com' },
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  timeFormat: 'yyyy-LL-dd HH:mm',
  initialYear: 2024,
}

const FULL_ASSETS = {
  asset: { host: 'cdn.example.com', scheme: 'https' },
  storage: {
    enabled: false,
    endpoint: '',
    region: '',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
    forcePathStyle: false,
    urlTemplate: '',
  },
  upload: { maxBytes: 8 * 1024 * 1024, jpegQuality: 82 },
}

function fullPayload(section: SettingsSection): Record<string, unknown> {
  const defaults = SECTION_REGISTRY[section].defaults
  if (defaults !== null) {
    return defaults
  }
  return section === 'general' ? FULL_GENERAL : FULL_ASSETS
}

// One object-valued key per section for the depth ≥ 1 sweep. `security.cors`
// sits behind a `.default(...)` wrapper, pinning the unwrap logic.
const NESTED_OBJECT_KEY: Partial<Record<SettingsSection, string>> = {
  general: 'author',
  assets: 'storage',
  navigation: 'navigation',
  content: 'pagination',
  sidebar: 'sidebar',
  comments: 'comments',
  seo: 'toc',
  mail: 'mail',
  newsletter: 'newsletter',
  cache: 'cache',
  rateLimit: 'signIn',
  fonts: 'og',
  backup: 'scheduled',
  analytics: 'analytics',
  security: 'cors',
}

describe('server/domains/settings/services/assertSectionPatchKeys', () => {
  describe.each(SETTINGS_SECTIONS.map((section) => ({ section })))('$section', ({ section }) => {
    it('accepts the section defaults payload (a full object is a valid patch)', () => {
      expect(() => assertSectionPatchKeys(section, fullPayload(section))).not.toThrow()
    })

    it('rejects an unknown key at depth 0', () => {
      const payload = { ...fullPayload(section), bogus: 1 }

      let error: unknown
      try {
        assertSectionPatchKeys(section, payload)
      } catch (e) {
        error = e
      }

      expect(error).toBeInstanceOf(DomainError)
      const domainError = error as DomainError
      expect(domainError.code).toBe('BAD_REQUEST')
      expect(domainError.issues).toContainEqual({
        messageKey: 'admin.settings.errors.unrecognizedKeys',
        params: { keys: 'bogus' },
        fallbackMessage: 'Unrecognized keys: bogus',
        code: 'unrecognized_keys',
        path: ['bogus'],
      })
    })

    it('rejects an unknown key at depth ≥ 1 with the full path', () => {
      const nestedKey = NESTED_OBJECT_KEY[section]
      if (nestedKey === undefined) {
        return
      }
      const payload = structuredClone(fullPayload(section))
      ;(payload[nestedKey] as Record<string, unknown>).bogus = 1

      let error: unknown
      try {
        assertSectionPatchKeys(section, payload)
      } catch (e) {
        error = e
      }

      expect(error).toBeInstanceOf(DomainError)
      const domainError = error as DomainError
      expect(domainError.issues).toContainEqual({
        messageKey: 'admin.settings.errors.unrecognizedKeys',
        params: { keys: 'bogus' },
        fallbackMessage: 'Unrecognized keys: bogus',
        code: 'unrecognized_keys',
        path: [nestedKey, 'bogus'],
      })
    })
  })

  it('rejects a non-object payload at the root with the typed shape descriptor', () => {
    let error: unknown
    try {
      assertSectionPatchKeys('mail', 'nope')
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(DomainError)
    expect((error as DomainError).issues).toContainEqual({
      messageKey: 'admin.settings.errors.expectedObject',
      fallbackMessage: 'The settings patch must be an object.',
      code: 'invalid_type',
      path: [],
    })
  })

  it('lists every offending key once while preserving each field path', () => {
    const payload = { ...fullPayload('mail'), bogus: 1, mail: { sender: 'a@b.co', other: 2 } }

    let error: unknown
    try {
      assertSectionPatchKeys('mail', payload)
    } catch (e) {
      error = e
    }

    expect(error).toBeInstanceOf(DomainError)
    const issues = (error as DomainError).issues ?? []
    expect(issues).toHaveLength(2)
    // One issue per offending key; each carries the full key list and its own path.
    for (const issue of issues) {
      expect(issue).toMatchObject({
        messageKey: 'admin.settings.errors.unrecognizedKeys',
        params: { keys: 'bogus, other' },
        fallbackMessage: 'Unrecognized keys: bogus, other',
        code: 'unrecognized_keys',
      })
    }
    expect(new Set(issues.map((issue) => issue.path?.join('.')))).toEqual(new Set(['bogus', 'mail.other']))
  })

  it('rejects mask fields the loader projection attaches', () => {
    expect(() =>
      assertSectionPatchKeys('mail', { mail: { smtpHost: 'smtp.example.com', smtpPassMask: 'abcd' } }),
    ).toThrowError(DomainError)
  })

  it('treats arrays as leaves — element values are the merged validation’s job', () => {
    // Arrays replace wholesale — the walker must not recurse into elements.
    expect(() =>
      assertSectionPatchKeys('sidebar', {
        sidebar: { widgets: [{ type: 'search', enabled: true, bogus: 1 }] },
      }),
    ).not.toThrow()
  })

  it('accepts partial patches (honest single-field writes)', () => {
    expect(() => assertSectionPatchKeys('security', { cors: { enabled: true } })).not.toThrow()
    expect(() => assertSectionPatchKeys('mail', { mail: { smtpHost: 'smtp.example.com' } })).not.toThrow()
    expect(() => assertSectionPatchKeys('rateLimit', { signIn: { windowSeconds: 600 } })).not.toThrow()
  })
})
