import type { BlogSettingsSnapshot } from '@/shared/config/snapshot'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@/shared/config/snapshot'

export function getBlogSettingsBundleSync(): BlogSettingsBundle | null {
  return BLOG_SETTINGS_SNAPSHOT_SLOT.read()
}

/** Bundle + revision from the same read — call this once per representation. */
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

/**
 * Section read from an explicit snapshot bundle (a request-pinned capture or a
 * background task's send-time resolve). Omit `bundle` to read the process
 * snapshot. Passing `null` means "captured before install" and throws instead
 * of silently mixing the two sources.
 */
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

/** The ONE receive-switch read for every webmention surface (root `<link>`, SSR `Link` header, the 410 gate, the inbox worker): a missing section reads as the schema default ON so discovery and the receive endpoint never disagree. */
export function isWebmentionReceiveEnabled(
  bundle: { webmentions?: { webmention?: { receiveEnabled?: boolean } } | null } | null | undefined,
): boolean {
  return bundle?.webmentions?.webmention?.receiveEnabled !== false
}
