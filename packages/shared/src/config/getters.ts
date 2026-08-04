import type { BlogSettingsBundle } from '@kobato/shared/config/types'

import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@kobato/shared/config/snapshot'

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

/**
 * The ONE receive-switch read for every webmention surface (root
 * document `<link>`, SSR `Link` header, the 410 gate, the inbox
 * worker): a missing section — hydration has not backfilled it yet —
 * reads as the schema default ON, so endpoint discovery and the receive
 * endpoint can never disagree about whether mentions are accepted.
 * Accepts the structural subset every caller holds (the full bundle or
 * the root loader's trimmed shape).
 */
export function isWebmentionReceiveEnabled(
  bundle: { webmentions?: { webmention?: { receiveEnabled?: boolean } } | null } | null | undefined,
): boolean {
  return bundle?.webmentions?.webmention?.receiveEnabled !== false
}
