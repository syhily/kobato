import { and, count, desc, eq, inArray, isNotNull, isNull, lt, type SQL } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { NewNotificationRecipient, NotificationRecipientRow, NotificationRow } from '@/server/infra/db/types'
import type { NotificationKind } from '@/shared/contracts/notifications'

import { notification, notificationRecipient } from '@/server/infra/db/schema/notification'
import { user } from '@/server/infra/db/schema/user'

export interface NewNotificationRow {
  kind: NotificationKind
  senderId: number | null
  title: string
  body: string
  replyable: boolean
  source?: string | null
  actionUrl?: string | null
}

/**
 * Insert the message and its fan-out recipient rows in ONE sync transaction;
 * the root's `threadId` backfills to its own id (replies pass the root id in
 * `data.threadId` via the `threadId` argument instead).
 */
export function createNotificationWithRecipients(
  db: Database,
  data: NewNotificationRow & { threadId?: number },
  recipientIds: readonly number[],
): NotificationRow {
  return db.transaction((tx) => {
    const inserted = tx
      .insert(notification)
      .values({
        threadId: data.threadId ?? 0,
        kind: data.kind,
        senderId: data.senderId,
        title: data.title,
        body: data.body,
        replyable: data.replyable,
        source: data.source ?? null,
        actionUrl: data.actionUrl ?? null,
      })
      .returning()
      .all()[0]!
    const threadId = data.threadId ?? inserted.id
    if (inserted.threadId !== threadId) {
      tx.update(notification).set({ threadId }).where(eq(notification.id, inserted.id)).run()
      inserted.threadId = threadId
    }
    if (recipientIds.length > 0) {
      const rows: NewNotificationRecipient[] = recipientIds.map((userId) => ({
        notificationId: inserted.id,
        userId,
      }))
      tx.insert(notificationRecipient).values(rows).run()
    }
    return inserted
  })
}

export interface NotificationInboxRow {
  message: NotificationRow
  recipient: NotificationRecipientRow
}

export interface InboxFilters {
  kinds?: readonly NotificationKind[]
  unreadOnly?: boolean
  /** Page anchor: only messages with id < cursor. */
  cursorId?: number
  limit: number
}

// Inbox listing, newest first; the cursor paginates by message id.
export async function listNotificationsForUser(
  db: Database,
  userId: number,
  filters: InboxFilters,
): Promise<NotificationInboxRow[]> {
  const conditions: SQL[] = [eq(notificationRecipient.userId, userId)]
  if (filters.kinds !== undefined) {
    conditions.push(inArray(notification.kind, [...filters.kinds]))
  }
  if (filters.unreadOnly === true) {
    conditions.push(isNull(notificationRecipient.readAt))
  }
  if (filters.cursorId !== undefined) {
    conditions.push(lt(notification.id, filters.cursorId))
  }
  return db
    .select({ message: notification, recipient: notificationRecipient })
    .from(notificationRecipient)
    .innerJoin(notification, eq(notificationRecipient.notificationId, notification.id))
    .where(and(...conditions))
    .orderBy(desc(notification.id))
    .limit(filters.limit)
}

export function countUnreadNotifications(db: Database, userId: number): number {
  const rows = db
    .select({ value: count() })
    .from(notificationRecipient)
    .where(and(eq(notificationRecipient.userId, userId), isNull(notificationRecipient.readAt)))
    .all()
  return rows[0]?.value ?? 0
}

/** Mark rows read; `ids` omitted = every unread row of the user. Returns the touched count. */
export function markNotificationsRead(db: Database, userId: number, ids?: readonly number[]): number {
  const conditions: SQL[] = [eq(notificationRecipient.userId, userId), isNull(notificationRecipient.readAt)]
  if (ids !== undefined) {
    conditions.push(inArray(notificationRecipient.notificationId, [...ids]))
  }
  const result = db
    .update(notificationRecipient)
    .set({ readAt: new Date() })
    .where(and(...conditions))
    .run()
  return Number(result.changes)
}

export async function listThreadNotifications(db: Database, threadId: number): Promise<NotificationRow[]> {
  return db.select().from(notification).where(eq(notification.threadId, threadId)).orderBy(notification.id)
}

/** Distinct senders + recipients across the whole thread — the reply routing base. */
export function listThreadParticipantIds(db: Database, threadId: number): number[] {
  const participants = new Set<number>()
  const messages = db
    .select({ senderId: notification.senderId })
    .from(notification)
    .where(and(eq(notification.threadId, threadId), isNotNull(notification.senderId)))
    .all()
  for (const message of messages) {
    participants.add(message.senderId!)
  }
  const recipients = db
    .select({ userId: notificationRecipient.userId })
    .from(notificationRecipient)
    .innerJoin(notification, eq(notificationRecipient.notificationId, notification.id))
    .where(eq(notification.threadId, threadId))
    .all()
  for (const recipient of recipients) {
    participants.add(recipient.userId)
  }
  return [...participants]
}

/** Active (non-soft-deleted, named-role) user ids; `adminsOnly` narrows to role='admin'. */
export function listRecipientUserIds(db: Database, options: { adminsOnly: boolean }): number[] {
  const conditions: SQL[] = [isNull(user.deletedAt), isNotNull(user.role)]
  if (options.adminsOnly) {
    conditions.push(eq(user.role, 'admin'))
  }
  return db
    .select({ id: user.id })
    .from(user)
    .where(and(...conditions))
    .all()
    .map((row) => row.id)
}

export function findUserNamesByIds(db: Database, ids: readonly number[]): Map<number, string> {
  if (ids.length === 0) {
    return new Map()
  }
  const rows = db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, [...ids]))
    .all()
  return new Map(rows.map((row) => [row.id, row.name]))
}

/** Recipient read-state map for a single message — powers the per-user DTO. */
export function findRecipientRow(
  db: Database,
  notificationId: number,
  userId: number,
): NotificationRecipientRow | null {
  const rows = db
    .select()
    .from(notificationRecipient)
    .where(and(eq(notificationRecipient.notificationId, notificationId), eq(notificationRecipient.userId, userId)))
    .limit(1)
    .all()
  return rows[0] ?? null
}
