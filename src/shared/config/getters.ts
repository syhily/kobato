import type { BlogSettingsBundle } from '@/shared/config/types'

import { withCacheFallbacks } from '@/shared/config/cache'
import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@/shared/config/snapshot'

export function getBlogSettingsBundleSync(): BlogSettingsBundle | null {
  const raw = BLOG_SETTINGS_SNAPSHOT_SLOT.read()
  if (raw === null) {
    return null
  }
  return raw
}

export function requireBlogSettingsBundle(): BlogSettingsBundle {
  const bundle = getBlogSettingsBundleSync()
  if (bundle === null) {
    throw new Error('Blog settings have not been hydrated yet. The install gate should have intercepted this request.')
  }
  return bundle
}

export function requireBlogSettingsSection<K extends keyof BlogSettingsBundle>(
  section: K,
): NonNullable<BlogSettingsBundle[K]> {
  const value = requireBlogSettingsBundle()[section]
  if (value === null) {
    throw new Error(
      `Blog settings section '${section}' is missing from the snapshot. ` +
        'The install flow seeds every section up front, so this usually ' +
        'means a row was manually truncated. Re-run install or restore from backup.',
    )
  }
  return value
}

export function getCacheSettings(): NonNullable<BlogSettingsBundle['cache']> {
  return withCacheFallbacks(requireBlogSettingsSection('cache'))
}
