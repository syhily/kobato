import type { SettingsSection } from '@kobato/shared/config/sections'

import { SECTION_REGISTRY } from '@kobato/server/domains/settings/sections/registry'
import { assertSectionPatchKeys } from '@kobato/server/domains/settings/services/section-patch'
import { DomainError } from '@kobato/server/infra/http/errors'
import { SETTINGS_SECTIONS } from '@kobato/shared/config/sections'
import { describe, expect, it } from 'vitest'

// Setup-time complete payloads for the two sections that ship no registry
// defaults (`defaults: null`): their first write must arrive complete, so
// the fixtures below stand in for `meta.defaults` in the parameter sweep.
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

// One object-valued key per section for the depth ≥ 1 sweep. `limits` is
// flat scalars and `socials` holds only an array at depth 1 — neither has
// a nested object to walk into. `security.cors` sits behind a
// `.default(...)` wrapper, pinning the unwrap logic.
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
  rateLimit: 'signInIp',
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
      expect(domainError.issues).toContainEqual({ message: 'Unrecognized key: "bogus"', path: ['bogus'] })
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
        message: 'Unrecognized key: "bogus"',
        path: [nestedKey, 'bogus'],
      })
    })
  })

  it('rejects a non-object payload at the root', () => {
    expect(() => assertSectionPatchKeys('mail', 'nope')).toThrowError(DomainError)
  })

  it('rejects mask fields the loader projection attaches', () => {
    expect(() => assertSectionPatchKeys('mail', { mail: { host: 'api.zeabur.com', apiKeyMask: 'abcd' } })).toThrowError(
      DomainError,
    )
  })

  it('treats arrays as leaves — element values are the merged validation’s job', () => {
    // The walker must not recurse into array elements (arrays replace
    // wholesale); a bogus key inside a widget row is caught by the
    // post-merge schema validation, not here.
    expect(() =>
      assertSectionPatchKeys('sidebar', {
        sidebar: { widgets: [{ type: 'search', enabled: true, bogus: 1 }] },
      }),
    ).not.toThrow()
  })

  it('accepts partial patches (honest single-field writes)', () => {
    expect(() => assertSectionPatchKeys('security', { cors: { enabled: true } })).not.toThrow()
    expect(() => assertSectionPatchKeys('mail', { mail: { host: 'api.zeabur.com' } })).not.toThrow()
    expect(() => assertSectionPatchKeys('rateLimit', { signInIp: { windowSeconds: 600 } })).not.toThrow()
  })
})
