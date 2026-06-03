import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { BlogSettingsBundle } from '@/shared/config/types'

import { hydrateBlogSettings } from '@/server/domains/settings/services/hydrate'
import { getLogger } from '@/server/infra/logger'
import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@/shared/config/snapshot'
import { deepClone, deepFreeze } from '@/shared/utils/tools'

const log = getLogger('settings.snapshot')

export function warmBlogSettingsSnapshot(db: NodePgDatabase): void {
  void hydrateBlogSettings(db).catch((error) => {
    log.error('Blog settings hydration failed', { error })
  })
}

export function setBlogSettingsBundleForTests(value: BlogSettingsBundle | null | undefined): void {
  const frozen = value == null ? value : deepFreeze(deepClone(value))
  BLOG_SETTINGS_SNAPSHOT_SLOT.write(frozen)
  BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(frozen === undefined ? undefined : Promise.resolve(frozen ?? null))
}
