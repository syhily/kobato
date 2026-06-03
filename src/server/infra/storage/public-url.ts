import { requireBlogSettingsSection } from '@/shared/config/getters'

/**
 * Public base URL the runtime joins with `<storagePath>` to compute
 * public asset URLs (images, music, etc.).
 *
 * Returns the configured bucket URL even when the upload toggle is OFF —
 * that lets the SSR enhancer keep rendering existing `s3` rows after an
 * admin disables further uploads. Returns `null` when the section is
 * unconfigured (no `publicBaseUrl` to join with).
 */
export function getPublicBaseUrl(): string | null {
  const assets = requireBlogSettingsSection('assets')
  const host = assets.asset.host.trim()
  if (host === '') {
    return null
  }
  return `${assets.asset.scheme}://${trimTrailingSlash(host)}`
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}
