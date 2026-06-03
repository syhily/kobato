import type { UpdateSettingsInput } from '@/shared/config/contracts'
import type { SettingsSection } from '@/shared/config/sections'

export { SETTINGS_SECTIONS } from '@/shared/config/sections'
export type { SettingsSection, UpdateSettingsInput }

export { ASSETS_STORAGE_INSTALL_DEFAULTS } from '@/server/domains/settings/sections/defaults'

export {
  buildDefaultSectionPayloads,
  SECTION_REGISTRY,
  sectionFromScope,
  SETTINGS_SCOPE_PREFIX,
  type SectionMeta,
} from '@/server/domains/settings/sections/registry'

export { updateSettingsSchema } from '@/server/domains/settings/sections/schemas'
