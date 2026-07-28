import { getBlogSettingsBundleSync } from '@/shared/config/getters'

export function isPasskeyEnabled(): boolean {
  return getBlogSettingsBundleSync()?.security?.passkey?.enabled === true
}

/**
 * Whether this user row must authenticate with a passkey right now:
 * their login method is `passkey`, they hold a real role, the account
 * is not deleted, and the global passkey switch is on. When the global
 * switch is off the check degrades to false so affected users can
 * still fall back to password signin.
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
