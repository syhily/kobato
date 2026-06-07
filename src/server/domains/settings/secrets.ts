import type { SettingsSection } from '@/shared/config/sections'
import type { BlogSettingsBundle } from '@/shared/config/types'

export interface SecretFieldConfig {
  section: SettingsSection
  bundleKey: keyof BlogSettingsBundle
  path: string
  field: string
}

// Single source of truth for settings sections that contain encrypted
// secrets. Both the snapshot reader (decrypt-on-load) and the write
// path (preserve-on-omit / encrypt-on-save) derive their local views
// from this array so a new secret field only needs to be added once.
export const SECRET_FIELDS: readonly SecretFieldConfig[] = [
  { section: 'mail', bundleKey: 'mail', path: 'mail', field: 'apiKey' },
  { section: 'assets', bundleKey: 'assets', path: 'storage', field: 'secretAccessKey' },
  { section: 'search', bundleKey: 'search', path: 'search', field: 'apiKey' },
]
