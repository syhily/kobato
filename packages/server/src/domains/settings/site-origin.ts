import { getBlogSettingsBundleSync } from '@kobato/settings/getters.ts'

export function resolveSiteOrigin(request: Request): string {
  return getBlogSettingsBundleSync()?.siteIdentity?.website ?? new URL(request.url).origin
}
