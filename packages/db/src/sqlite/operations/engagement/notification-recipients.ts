import type { Database } from '@kobato/db/sqlite/database'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { notification, notificationRecipient } from '@kobato/db/sqlite/schema/notification'
import { user } from '@kobato/db/sqlite/schema/user'
import { and, eq, inArray, isNotNull, isNull, type SQL } from 'drizzle-orm'

export function listThreadParticipantIds(db: Database, threadId: number): number[] {
  const participants = new Set<number>()
  const messages = sqliteOf(db)
    .select({ senderId: notification.senderId })
    .from(notification)
    .innerJoin(user, eq(notification.senderId, user.id))
    .where(and(eq(notification.threadId, threadId), isNotNull(notification.senderId), isNull(user.deletedAt)))
    .all()
  for (const message of messages) {
    participants.add(message.senderId!)
  }
  const recipients = sqliteOf(db)
    .select({ userId: notificationRecipient.userId })
    .from(notificationRecipient)
    .innerJoin(notification, eq(notificationRecipient.notificationId, notification.id))
    .innerJoin(user, eq(notificationRecipient.userId, user.id))
    .where(and(eq(notification.threadId, threadId), isNull(user.deletedAt)))
    .all()
  for (const recipient of recipients) {
    participants.add(recipient.userId)
  }
  return [...participants]
}

export function isThreadParticipant(db: Database, threadId: number, userId: number): boolean {
  const sent = sqliteOf(db)
    .select({ id: notification.id })
    .from(notification)
    .where(and(eq(notification.threadId, threadId), eq(notification.senderId, userId)))
    .limit(1)
    .all()
  if (sent.length > 0) {
    return true
  }
  const received = sqliteOf(db)
    .select({ notificationId: notificationRecipient.notificationId })
    .from(notificationRecipient)
    .innerJoin(notification, eq(notificationRecipient.notificationId, notification.id))
    .where(and(eq(notification.threadId, threadId), eq(notificationRecipient.userId, userId)))
    .limit(1)
    .all()
  return received.length > 0
}

export function listRecipientUserIds(db: Database, options: { adminsOnly: boolean }): number[] {
  const conditions: SQL[] = [isNull(user.deletedAt), isNotNull(user.role)]
  if (options.adminsOnly) {
    conditions.push(eq(user.role, 'admin'))
  }
  return sqliteOf(db)
    .select({ id: user.id })
    .from(user)
    .where(and(...conditions))
    .all()
    .map((row) => row.id)
}

export function isActiveUserId(db: Database, userId: number): boolean {
  const rows = sqliteOf(db)
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.id, userId), isNull(user.deletedAt), isNotNull(user.role)))
    .limit(1)
    .all()
  return rows.length > 0
}

export function findUserNamesByIds(db: Database, ids: readonly number[]): Map<number, string> {
  if (ids.length === 0) {
    return new Map()
  }
  const rows = sqliteOf(db)
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, [...ids]))
    .all()
  return new Map(rows.map((row) => [row.id, row.name]))
}

export function findUserEmailsByIds(db: Database, ids: readonly number[]): Map<number, string> {
  if (ids.length === 0) {
    return new Map()
  }
  const rows = sqliteOf(db)
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(inArray(user.id, [...ids]))
    .all()
  return new Map(rows.map((row) => [row.id, row.email]))
}
