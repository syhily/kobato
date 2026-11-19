import type { BlogSettingsSnapshot } from '@kobato/settings/snapshot.ts'
import type { BlogSettingsBundle } from '@kobato/settings/types.ts'

import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@kobato/settings/snapshot.ts'

export function getBlogSettingsBundleSync(): BlogSettingsBundle | null {
  return BLOG_SETTINGS_SNAPSHOT_SLOT.read()
}

export function getBlogSettingsSnapshotSync(): BlogSettingsSnapshot {
  return BLOG_SETTINGS_SNAPSHOT_SLOT.readSnapshot()
}

const NOT_HYDRATED_MESSAGE =
  'Blog settings have not been hydrated yet. The install gate should have intercepted this request.'

export function requireBlogSettingsBundle(): BlogSettingsBundle {
  const bundle = getBlogSettingsBundleSync()
  if (bundle === null) {
    throw new Error(NOT_HYDRATED_MESSAGE)
  }
  return bundle
}

export function requireBlogSettingsSection<K extends keyof BlogSettingsBundle>(
  section: K,
  bundle?: BlogSettingsBundle | null,
): NonNullable<BlogSettingsBundle[K]> {
  const resolved = bundle === undefined ? requireBlogSettingsBundle() : bundle
  if (resolved === null) {
    throw new Error(NOT_HYDRATED_MESSAGE)
  }
  const value = resolved[section]
  if (value === null) {
    throw new Error(
      `Blog settings section '${section}' is missing from the snapshot. ` +
        'The install flow seeds every section up front, so this usually ' +
        'means a row was manually truncated. Re-run install or restore from backup.',
    )
  }
  return value
}

export function isWebmentionReceiveEnabled(
  bundle: { webmentions?: { webmention?: { receiveEnabled?: boolean } } | null } | null | undefined,
): boolean {
  return bundle?.webmentions?.webmention?.receiveEnabled !== false
}
