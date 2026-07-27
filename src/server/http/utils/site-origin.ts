import { getBlogSettingsBundleSync } from '@/shared/config/getters'

/**
 * Single owner of the site-origin derivation: the configured
 * `siteIdentity.website` when set, otherwise the origin of the incoming
 * request URL. Email links (invites, password resets) must point at the
 * public site, never at a per-call hand-rolled fallback.
 */
export function resolveSiteOrigin(request: Request): string {
  return getBlogSettingsBundleSync()?.siteIdentity?.website ?? new URL(request.url).origin
}
