import type { SettingsSection } from '@/shared/config/sections'
import type { BlogSettingsBundle, SecretMasks } from '@/shared/config/types'
import type { Assert, Equals } from '@/shared/contracts/primitives'

import { SECTION_TO_BUNDLE_KEY } from '@/shared/config/sections'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

export interface SecretFieldConfig {
  section: SettingsSection
  bundleKey: keyof BlogSettingsBundle
  // The literal pin holds only via `declareSecret`'s generics — the SECRET_FIELDS
  // array plus the `_secretFieldConfigShape` assert below are the defence.
  path: string
  field: string
  maskKey: keyof SecretMasks
  /** Typed read of this secret from the in-memory bundle; `undefined`
   *  when the section or the secret slot is absent. */
  read: (bundle: BlogSettingsBundle) => string | undefined
  /** Typed copy-with-secret-blanked for the admin redaction path.
   *  Returns the input reference when there is nothing to blank. */
  redact: (bundle: BlogSettingsBundle) => BlogSettingsBundle
}

/** The bundle slot DTO a section hydrates into (schema-pinned by the
 *  registry parity assert in `sections/registry.ts`). */
type SectionDto<S extends SettingsSection> = NonNullable<BlogSettingsBundle[(typeof SECTION_TO_BUNDLE_KEY)[S]]>

type BucketKeysOf<T> = { [K in keyof T]-?: T[K] extends object | undefined ? K : never }[keyof T]

/** Keys of `T` whose value is an OPTIONAL string — required strings like
 *  `host` / `endpoint` are not valid secret slots. */
type OptionalStringKeysOf<T> = { [K in keyof T]-?: string | undefined extends T[K] ? K : never }[keyof T]

/**
 * The single declaration point for an encrypted settings secret.
 * `section`/`path`/`field` are type-checked against the section's bundle DTO — renaming
 * a secret without updating this declaration fails type-checking HERE.
 */
export function declareSecret<
  S extends SettingsSection,
  P extends BucketKeysOf<SectionDto<S>> & string,
  F extends OptionalStringKeysOf<SectionDto<S>[P]> & string,
  M extends keyof SecretMasks,
>(decl: {
  section: S
  path: P
  field: F
  maskKey: M
}): SecretFieldConfig & { section: S; path: P; field: F; maskKey: M } {
  const bundleKey = SECTION_TO_BUNDLE_KEY[decl.section]

  const read = (bundle: BlogSettingsBundle): string | undefined => {
    const value = unsafeCast<Record<string, Record<string, unknown>> | null>(bundle[bundleKey])?.[decl.path]?.[
      decl.field
    ]
    return typeof value === 'string' ? value : undefined
  }

  const redact = (bundle: BlogSettingsBundle): BlogSettingsBundle => {
    const sectionData = unsafeCast<Record<string, Record<string, unknown>> | null>(bundle[bundleKey])
    // The string check below doubles as the malformed-input pass-through.
    const value = sectionData?.[decl.path]?.[decl.field]
    if (typeof value !== 'string' || value === '') {
      return bundle
    }
    const bucket = sectionData?.[decl.path]
    return {
      ...bundle,
      [bundleKey]: { ...sectionData, [decl.path]: { ...bucket, [decl.field]: '' } },
    }
  }

  return { ...decl, bundleKey, read, redact }
}

// Single source of truth for settings sections that contain encrypted secrets: the
// snapshot reader, the write path, and the admin mask projection all derive from it.
export const SECRET_FIELDS = [
  declareSecret({ section: 'mail', path: 'mail', field: 'apiKey', maskKey: 'mailApiKeyMask' }),
  declareSecret({ section: 'mail', path: 'mail', field: 'smtpPass', maskKey: 'mailSmtpPassMask' }),
  declareSecret({ section: 'mail', path: 'mail', field: 'mailgunApiKey', maskKey: 'mailMailgunApiKeyMask' }),
  declareSecret({ section: 'assets', path: 'storage', field: 'secretAccessKey', maskKey: 'assetsSecretAccessKeyMask' }),
]

// Post-hoc assert, not `satisfies` — a contextual element type would widen the
// generic inference and break the literal pin.
type _secretFieldConfigShape = Assert<(typeof SECRET_FIELDS)[number] extends SecretFieldConfig ? true : false>

// Compile-time parity: every SecretMasks key maps 1:1 to a SECRET_FIELDS entry.
type _secretFieldMaskParity = Assert<Equals<(typeof SECRET_FIELDS)[number]['maskKey'], keyof SecretMasks>>
