import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import bcrypt from 'bcryptjs'

import { revokeAllSessionsOfUser } from '@/server/domains/auth/session-storage'
import {
  findUserById,
  findUserIdByEmail,
  PASSWORD_HASH_ROUNDS,
  updateUserById,
} from '@/server/infra/db/operations/user'
import { DomainError } from '@/server/infra/http/errors'

export interface AccountProfileInput {
  name?: string
  link?: string | null
  badgeName?: string | null
  badgeColor?: string | null
  badgeTextColor?: string | null
  receiveEmail?: boolean
}

export async function updateAccountProfile(
  db: NodePgDatabase,
  userId: bigint,
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

  const updated = await updateUserById(db, userId, patch)
  if (!updated) {
    throw new DomainError('NOT_FOUND', '用户不存在。')
  }
  return updated
}

export async function updateAccountPassword(
  db: NodePgDatabase,
  userId: bigint,
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
  await revokeAllSessionsOfUser(dbUser.id, currentSessionId)
}

export { findUserById, findUserIdByEmail }
