import type { Database } from '@kobato/server/infra/db/database'
import type { LoginMethod } from '@kobato/shared/contracts/users'

import { revokeAllSessionsOfUser } from '@kobato/server/domains/auth/services/sessions'
import { findUserById, PASSWORD_HASH_ROUNDS, updateUserById } from '@kobato/server/infra/db/operations/user'
import { DomainError } from '@kobato/server/infra/http/errors'
import bcrypt from 'bcryptjs'

export interface AccountProfileInput {
  name?: string
  link?: string | null
  badgeName?: string | null
  badgeColor?: string | null
  badgeTextColor?: string | null
  receiveEmail?: boolean
}

// The self-service profile projection behind `/admin/me/profile`. A
// missing row (deleted mid-session) degrades to empty fields instead of
// failing the page — the layout already guarantees a live session.
export interface AccountProfile {
  id: string
  name: string
  email: string
  link: string
  role: 'admin' | 'author' | 'visitor' | null
  badgeName: string
  badgeColor: string
  createdAt: string | null
  lastIp: string | null
  lastUa: string | null
  loginMethod: LoginMethod
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
    throw new DomainError('NOT_FOUND', '用户不存在。')
  }

  const canSetBadge = viewerRole === 'admin' || viewerRole === 'author'
  const patch: Parameters<typeof updateUserById>[2] = {}
  if (input.name !== undefined) {
    patch.name = input.name
  }
  if (input.link !== undefined) {
    patch.link = input.link ?? undefined
  }
  if (input.receiveEmail !== undefined) {
    patch.receiveEmail = input.receiveEmail
  }
  if (canSetBadge) {
    if (input.badgeName !== undefined) {
      patch.badgeName = input.badgeName ?? undefined
    }
    if (input.badgeColor !== undefined) {
      patch.badgeColor = input.badgeColor ?? undefined
    }
    if (input.badgeTextColor !== undefined) {
      patch.badgeTextColor = input.badgeTextColor ?? undefined
    }
  }

  // A visitor submitting ONLY badge fields ends up with nothing to
  // update (badge writes are admin/author-only) — a graceful no-op,
  // never drizzle's "No values to set" 500.
  if (Object.keys(patch).length === 0) {
    return dbUser
  }

  const updated = await updateUserById(db, userId, patch)
  if (!updated) {
    throw new DomainError('NOT_FOUND', '用户不存在。')
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
    throw new DomainError('NOT_FOUND', '用户不存在。')
  }
  const ok = await bcrypt.compare(oldPassword, dbUser.password)
  if (!ok) {
    throw new DomainError('FORBIDDEN', '原密码错误。')
  }
  const hashed = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS)
  await updateUserById(db, dbUser.id, { password: hashed })
  await revokeAllSessionsOfUser(db, dbUser.id, currentSessionId)
}
