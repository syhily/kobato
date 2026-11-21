import { getBlogSettingsBundleSync } from '@kobato/settings/getters'

export function resolveSiteOrigin(request: Request): string {
  return getBlogSettingsBundleSync()?.siteIdentity?.website ?? new URL(request.url).origin
}
