import { getBlogSettingsBundleSync } from '@/shared/config/getters'

/** Single owner of the site-origin derivation: configured `website` or the
 *  request origin — email links must point at the public site. */
export function resolveSiteOrigin(request: Request): string {
  return getBlogSettingsBundleSync()?.siteIdentity?.website ?? new URL(request.url).origin
}
