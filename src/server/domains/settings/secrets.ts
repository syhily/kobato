import type { SettingsSection } from '@/shared/config/sections'
import type { BlogSettingsBundle, SecretMasks } from '@/shared/config/types'
import type { Assert, Equals } from '@/shared/contracts/primitives'

export interface SecretFieldConfig {
  section: SettingsSection
  bundleKey: keyof BlogSettingsBundle
  path: string
  field: string
  maskKey: keyof SecretMasks
}

// Single source of truth for settings sections that contain encrypted
// secrets. The snapshot reader (decrypt-on-load), the write path
// (preserve-on-omit / encrypt-on-save), and the admin mask projection
// (computeSecretMasks) all derive their local views from this array so a
// new secret field only needs to be added once.
export const SECRET_FIELDS = [
  { section: 'mail', bundleKey: 'mail', path: 'mail', field: 'apiKey', maskKey: 'mailApiKeyMask' },
  { section: 'mail', bundleKey: 'mail', path: 'mail', field: 'smtpPass', maskKey: 'mailSmtpPassMask' },
  { section: 'mail', bundleKey: 'mail', path: 'mail', field: 'mailgunApiKey', maskKey: 'mailMailgunApiKeyMask' },
  {
    section: 'assets',
    bundleKey: 'assets',
    path: 'storage',
    field: 'secretAccessKey',
    maskKey: 'assetsSecretAccessKeyMask',
  },
] as const satisfies readonly SecretFieldConfig[]

// Compile-time parity: every SecretMasks key is produced by exactly one
// SECRET_FIELDS entry. Adding a secret field without a mask (or renaming
// one side) fails type-checking here.
type _secretFieldMaskParity = Assert<Equals<(typeof SECRET_FIELDS)[number]['maskKey'], keyof SecretMasks>>
