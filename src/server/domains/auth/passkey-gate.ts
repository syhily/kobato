import { getBlogSettingsBundleSync } from '@/shared/config/getters'

export function isPasskeyEnabled(): boolean {
  return getBlogSettingsBundleSync()?.security?.passkey?.enabled === true
}
