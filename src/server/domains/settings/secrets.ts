import type { SettingsSection } from '@/shared/config/sections'
import type { BlogSettingsBundle, SecretMasks } from '@/shared/config/types'
import type { Assert, Equals } from '@/shared/contracts/primitives'

export interface SecretFieldConfig {
  section: SettingsSection
  bundleKey: keyof BlogSettingsBundle
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

// Single source of truth for settings sections that contain encrypted
// secrets. The snapshot reader (decrypt-on-load), the write path
// (preserve-on-omit / encrypt-on-save), and the admin mask projection
// (`services/masks.ts`) all derive their local views from this array so a
// new secret field only needs to be added once. The typed `read`/`redact`
// closures are the bundle-facing half: they keep the mask/redact
// consumers free of string-key traversal, while `path`/`field` still
// serve the raw-row consumers (hydration, the write path) whose input is
// untyped JSON.
export const SECRET_FIELDS = [
  {
    section: 'mail',
    bundleKey: 'mail',
    path: 'mail',
    field: 'apiKey',
    maskKey: 'mailApiKeyMask',
    read: (bundle: BlogSettingsBundle) => bundle.mail?.mail.apiKey,
    redact: (bundle: BlogSettingsBundle) => {
      const mail = bundle.mail
      if (mail === null || typeof mail.mail.apiKey !== 'string' || mail.mail.apiKey === '') {
        return bundle
      }
      return { ...bundle, mail: { ...mail, mail: { ...mail.mail, apiKey: '' } } }
    },
  },
  {
    section: 'mail',
    bundleKey: 'mail',
    path: 'mail',
    field: 'smtpPass',
    maskKey: 'mailSmtpPassMask',
    read: (bundle: BlogSettingsBundle) => bundle.mail?.mail.smtpPass,
    redact: (bundle: BlogSettingsBundle) => {
      const mail = bundle.mail
      if (mail === null || typeof mail.mail.smtpPass !== 'string' || mail.mail.smtpPass === '') {
        return bundle
      }
      return { ...bundle, mail: { ...mail, mail: { ...mail.mail, smtpPass: '' } } }
    },
  },
  {
    section: 'mail',
    bundleKey: 'mail',
    path: 'mail',
    field: 'mailgunApiKey',
    maskKey: 'mailMailgunApiKeyMask',
    read: (bundle: BlogSettingsBundle) => bundle.mail?.mail.mailgunApiKey,
    redact: (bundle: BlogSettingsBundle) => {
      const mail = bundle.mail
      if (mail === null || typeof mail.mail.mailgunApiKey !== 'string' || mail.mail.mailgunApiKey === '') {
        return bundle
      }
      return { ...bundle, mail: { ...mail, mail: { ...mail.mail, mailgunApiKey: '' } } }
    },
  },
  {
    section: 'assets',
    bundleKey: 'assets',
    path: 'storage',
    field: 'secretAccessKey',
    maskKey: 'assetsSecretAccessKeyMask',
    read: (bundle: BlogSettingsBundle) => bundle.assets?.storage.secretAccessKey,
    redact: (bundle: BlogSettingsBundle) => {
      const assets = bundle.assets
      const key = assets?.storage.secretAccessKey
      if (assets === null || typeof key !== 'string' || key === '') {
        return bundle
      }
      return { ...bundle, assets: { ...assets, storage: { ...assets.storage, secretAccessKey: '' } } }
    },
  },
] as const satisfies readonly SecretFieldConfig[]

// Compile-time parity: every SecretMasks key is produced by exactly one
// SECRET_FIELDS entry. Adding a secret field without a mask (or renaming
// one side) fails type-checking here.
type _secretFieldMaskParity = Assert<Equals<(typeof SECRET_FIELDS)[number]['maskKey'], keyof SecretMasks>>
