import type { AccountProfile } from '@kobato/contracts/users.ts'
import type { Database } from '@kobato/db/database.ts'

import { findUserById, PASSWORD_HASH_ROUNDS, updateUserById } from '@kobato/db/operations/user.ts'
import { deleteAllCredentials } from '@kobato/server/domains/auth/passkey/service.ts'
import { revokeAllSessionsOfUser } from '@kobato/server/domains/auth/services/sessions.ts'
import { revokeTokensFor } from '@kobato/server/domains/auth/verification-tokens.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import bcrypt from 'bcryptjs'

export interface AccountProfileInput {
  name?: string
  link?: string | null
  badgeName?: string | null
  badgeColor?: string | null
  badgeTextColor?: string | null
  receiveEmail?: boolean
}

export async function getAccountProfile(db: Database, userId: number): Promise<AccountProfile> {
  const dbUser = await findUserById(db, userId)
  return {
    id: String(userId),
    name: dbUser?.name ?? '',
    email: dbUser?.email ?? '',
    link: dbUser?.link ?? '',
    role: dbUser?.role ?? null,
    badgeName: dbUser?.badgeName ?? '',
    badgeColor: dbUser?.badgeColor ?? '',
    createdAt: dbUser?.createdAt ? dbUser.createdAt.toISOString() : null,
    lastIp: dbUser?.lastIp ?? null,
    lastUa: dbUser?.lastUa ?? null,
    loginMethod: dbUser?.loginMethod ?? 'password',
  }
}

export async function updateAccountProfile(
  db: Database,
  userId: number,
  input: AccountProfileInput,
  viewerRole: string | null | undefined,
) {
  const dbUser = await findUserById(db, userId)
  if (!dbUser || dbUser.deletedAt) {
    throw new DomainError('NOT_FOUND', descriptorFor('account.error.userNotFound'))
  }

  const canSetBadge = viewerRole === 'admin' || viewerRole === 'author'
  const patch: Parameters<typeof updateUserById>[2] = {}
  if (input.name !== undefined) {
    patch.name = input.name
  }
  if (input.link !== undefined) {
    patch.link = input.link
  }
  if (input.receiveEmail !== undefined) {
    patch.receiveEmail = input.receiveEmail
  }
  if (canSetBadge) {
    if (input.badgeName !== undefined) {
      patch.badgeName = input.badgeName
    }
    if (input.badgeColor !== undefined) {
      patch.badgeColor = input.badgeColor
    }
    if (input.badgeTextColor !== undefined) {
      patch.badgeTextColor = input.badgeTextColor
    }
  }

  // Empty patch (badge-only submits by visitors) is a graceful no-op.
  if (Object.keys(patch).length === 0) {
    return dbUser
  }

  const updated = await updateUserById(db, userId, patch)
  if (!updated) {
    throw new DomainError('NOT_FOUND', descriptorFor('account.error.userNotFound'))
  }
  return updated
}

export async function updateAccountPassword(
  db: Database,
  userId: number,
  oldPassword: string,
  newPassword: string,
  currentSessionId?: string,
) {
  const dbUser = await findUserById(db, userId)
  if (!dbUser || dbUser.deletedAt) {
    throw new DomainError('NOT_FOUND', descriptorFor('account.error.userNotFound'))
  }
  const ok = await bcrypt.compare(oldPassword, dbUser.password)
  if (!ok) {
    throw new DomainError('FORBIDDEN', descriptorFor('account.error.passwordWrong'))
  }
  const hashed = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS)
  // A password change returns the account to password signin and evicts
  // every registered passkey — a passkey planted on a hijacked session
  // must not survive the owner's password rotation.
  await updateUserById(db, dbUser.id, { password: hashed, loginMethod: 'password' })
  try {
    await deleteAllCredentials(db, dbUser.id)
  } catch {
    // Best-effort: don't block the password change if passkey cleanup fails.
  }
  await revokeAllSessionsOfUser(db, dbUser.id, currentSessionId)
  // A password change also kills every outstanding credential-bypass token
  // for the account: reset links, magic signin links, and pending OTPs.
  await revokeTokensFor(db, dbUser.id, 'password-reset')
  await revokeTokensFor(db, dbUser.id, 'signin-link')
  await revokeTokensFor(db, dbUser.id, 'signin-otp')
}
