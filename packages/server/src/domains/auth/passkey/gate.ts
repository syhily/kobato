import { getBlogSettingsBundleSync } from '@kobato/settings/getters'

export function isPasskeyEnabled(): boolean {
  return getBlogSettingsBundleSync()?.security?.passkey?.enabled === true
}

export function isPasskeySigninUser(
  user: { loginMethod: string; role: string | null; deletedAt: Date | null } | null,
): boolean {
  return user?.loginMethod === 'passkey' && Boolean(user.role) && user.deletedAt === null && isPasskeyEnabled()
}
