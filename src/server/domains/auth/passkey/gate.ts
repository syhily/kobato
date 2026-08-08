import { getBlogSettingsBundleSync } from '@/shared/config/getters'

export function isPasskeyEnabled(): boolean {
  return getBlogSettingsBundleSync()?.security?.passkey?.enabled === true
}

/**
 * Whether this user row must authenticate with a passkey right now;
 * false when the global passkey switch is off.
 */
export function isPasskeySigninUser(
  user: { loginMethod: string; role: string | null; deletedAt: Date | null } | null,
): boolean {
  return (
    user !== null &&
    user.loginMethod === 'passkey' &&
    Boolean(user.role) &&
    user.deletedAt === null &&
    isPasskeyEnabled()
  )
}
