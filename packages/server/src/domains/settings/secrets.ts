import type { SettingsSection } from '@kobato/shared/config/sections'
import type { BlogSettingsBundle, SecretMasks } from '@kobato/shared/config/types'
import type { Assert, Equals } from '@kobato/shared/contracts/primitives'

import { SECTION_TO_BUNDLE_KEY } from '@kobato/shared/config/sections'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'

export interface SecretFieldConfig {
  section: SettingsSection
  bundleKey: keyof BlogSettingsBundle
  // The literal pin on `path`/`field` holds only inside `declareSecret`'s
  // generics — a hand-written config bypassing the factory would drift as
  // a bare string again. The defence is the single-source SECRET_FIELDS
  // array plus the `_secretFieldConfigShape` assert below.
  path: string
  field: string
  maskKey: keyof SecretMasks
  /** Typed read of this secret from the in-memory bundle; `undefined`
   *  when the section or the secret slot is absent. */
  read: (bundle: BlogSettingsBundle) => string | undefined
  /** Typed copy-with-secret-blanked for the admin redaction path.
   *  Returns the input reference when there is nothing to blank, so
   *  untouched sections keep their identity. */
  redact: (bundle: BlogSettingsBundle) => BlogSettingsBundle
}

/** The bundle slot DTO a section hydrates into (schema-pinned by the
 *  registry parity assert in `sections/registry.ts`). */
type SectionDto<S extends SettingsSection> = NonNullable<BlogSettingsBundle[(typeof SECTION_TO_BUNDLE_KEY)[S]]>

/** Keys of `T` whose value is an object bucket. */
type BucketKeysOf<T> = { [K in keyof T]-?: T[K] extends object | undefined ? K : never }[keyof T]

/** Keys of `T` whose value is an OPTIONAL string — a secret slot follows
 *  the "optional ⇒ keep existing" convention (see the section schemas),
 *  so required strings like `host` / `endpoint` are not valid secrets. */
type OptionalStringKeysOf<T> = { [K in keyof T]-?: string | undefined extends T[K] ? K : never }[keyof T]

/**
 * The single declaration point for an encrypted settings secret.
 *
 * `section`/`path`/`field` are type-checked against the section's bundle
 * DTO: `path` must name an object bucket of the DTO, `field` an optional
 * string slot inside it. Since the registry parity assert pins that DTO
 * to the section schema's output, renaming a secret in the schema and
 * DTO but forgetting this declaration fails type-checking HERE — the
 * field identity can no longer drift as a bare string.
 *
 * Everything else derives from the declaration: `bundleKey` comes from
 * the shared `SECTION_TO_BUNDLE_KEY` mapping (never declared twice), and
 * `read`/`redact` are generic accessors over `bundle[bundleKey][path]
 * [field]`. The raw `path`/`field` strings still serve the raw-row
 * consumers (hydration, the write path, secrets migration) whose input
 * is untyped JSON — but they are now compile-time pinned, not free text.
 *
 * One deliberate difference from hand-written accessors: the derived
 * `read`/`redact` are total over malformed input (a missing bucket
 * yields `undefined` / a pass-through instead of a TypeError). Every
 * real input is schema-validated before it reaches the bundle, so that
 * branch is unreachable in practice.
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
    // The optional chains propagate a null section / missing bucket into
    // `value === undefined`, so the single string check below is also the
    // malformed-input pass-through.
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

// Single source of truth for settings sections that contain encrypted
// secrets. The snapshot reader (decrypt-on-load), the write path
// (preserve-on-omit / encrypt-on-save), and the admin mask projection
// (`services/masks.ts`) all derive their local views from this array so a
// new secret field only needs to be declared once.
export const SECRET_FIELDS = [
  declareSecret({ section: 'mail', path: 'mail', field: 'apiKey', maskKey: 'mailApiKeyMask' }),
  declareSecret({ section: 'mail', path: 'mail', field: 'smtpPass', maskKey: 'mailSmtpPassMask' }),
  declareSecret({ section: 'mail', path: 'mail', field: 'mailgunApiKey', maskKey: 'mailMailgunApiKeyMask' }),
  declareSecret({ section: 'assets', path: 'storage', field: 'secretAccessKey', maskKey: 'assetsSecretAccessKeyMask' }),
]

// Every entry must stay a full SecretFieldConfig for the consumers. This is
// a post-hoc assert instead of a `satisfies` on the array: a contextual
// SecretFieldConfig element type would widen the generic inference at each
// declareSecret call (`field` against `string`) and break the literal pin.
type _secretFieldConfigShape = Assert<(typeof SECRET_FIELDS)[number] extends SecretFieldConfig ? true : false>

// Compile-time parity: every SecretMasks key is produced by exactly one
// SECRET_FIELDS entry. Adding a secret field without a mask (or renaming
// one side) fails type-checking here.
type _secretFieldMaskParity = Assert<Equals<(typeof SECRET_FIELDS)[number]['maskKey'], keyof SecretMasks>>
