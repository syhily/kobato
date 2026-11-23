import type { Database } from '@kobato/db/sqlite/database'
import type { NotificationKind } from '@kobato/db/sqlite/schema/notification'
import type { NewNotificationRecipient, NotificationRecipientRow, NotificationRow } from '@kobato/db/sqlite/types'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { notification, notificationRecipient } from '@kobato/db/sqlite/schema/notification'
import { and, count, desc, eq, inArray, isNotNull, isNull, lt, notInArray, or, type SQL } from 'drizzle-orm'

const FAN_OUT_CHUNK_SIZE = 500

export interface NewNotificationRow {
  kind: NotificationKind
  senderId: number | null
  title: string
  body: string
  titleKey?: string | null
  titleParams?: string | null
  bodyKey?: string | null
  bodyParams?: string | null
  replyable: boolean
  source?: string | null
  actionUrl?: string | null
}

export function createNotificationWithRecipients(
  db: Database,
  data: NewNotificationRow & { threadId?: number },
  recipientIds: readonly number[],
  options?: { readRecipientIds?: readonly number[] },
): NotificationRow {
  return sqliteOf(db).transaction((tx) => {
    const inserted = tx
      .insert(notification)
      .values({
        threadId: data.threadId ?? 0,
        kind: data.kind,
        senderId: data.senderId,
        title: data.title,
        body: data.body,
        titleKey: data.titleKey ?? null,
        titleParams: data.titleParams ?? null,
        bodyKey: data.bodyKey ?? null,
        bodyParams: data.bodyParams ?? null,
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
      const readSet = new Set(options?.readRecipientIds ?? [])
      const readAt = new Date()
      const rows: NewNotificationRecipient[] = recipientIds.map((userId) => ({
        notificationId: inserted.id,
        userId,
        ...(readSet.has(userId) ? { readAt } : {}),
      }))
      for (let start = 0; start < rows.length; start += FAN_OUT_CHUNK_SIZE) {
        tx.insert(notificationRecipient)
          .values(rows.slice(start, start + FAN_OUT_CHUNK_SIZE))
          .run()
      }
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
  cursorId?: number
  limit: number
}

export async function listNotificationsForUser(
  db: Database,
  userId: number,
  filters: InboxFilters,
): Promise<NotificationInboxRow[]> {
  return notificationInboxQuery(db, userId, filters)
}

export function notificationInboxQuery(db: Database, userId: number, filters: InboxFilters) {
  const conditions: SQL[] = [eq(notificationRecipient.userId, userId), isNull(notification.recalledAt)]
  if (filters.kinds !== undefined) {
    conditions.push(inArray(notification.kind, [...filters.kinds]))
  }
  if (filters.unreadOnly === true) {
    conditions.push(isNull(notificationRecipient.readAt))
  }
  if (filters.cursorId !== undefined) {
    conditions.push(lt(notification.id, filters.cursorId))
  }
  return sqliteOf(db)
    .select({ message: notification, recipient: notificationRecipient })
    .from(notificationRecipient)
    .innerJoin(notification, eq(notificationRecipient.notificationId, notification.id))
    .where(and(...conditions))
    .orderBy(desc(notificationRecipient.notificationId))
    .limit(filters.limit)
}

export function countUnreadNotifications(db: Database, userId: number): number {
  const rows = sqliteOf(db)
    .select({ value: count() })
    .from(notificationRecipient)
    .innerJoin(notification, eq(notificationRecipient.notificationId, notification.id))
    .where(
      and(
        eq(notificationRecipient.userId, userId),
        isNull(notificationRecipient.readAt),
        isNull(notification.recalledAt),
      ),
    )
    .all()
  return rows[0]?.value ?? 0
}

export function markNotificationsRead(db: Database, userId: number, ids?: readonly number[]): number {
  const conditions: SQL[] = [eq(notificationRecipient.userId, userId), isNull(notificationRecipient.readAt)]
  if (ids !== undefined) {
    conditions.push(inArray(notificationRecipient.notificationId, [...ids]))
  }
  const result = sqliteOf(db)
    .update(notificationRecipient)
    .set({ readAt: new Date() })
    .where(and(...conditions))
    .run()
  return Number(result.changes)
}

export function markNotificationsUnread(db: Database, userId: number, ids: readonly number[]): number {
  const result = sqliteOf(db)
    .update(notificationRecipient)
    .set({ readAt: null })
    .where(
      and(
        eq(notificationRecipient.userId, userId),
        inArray(notificationRecipient.notificationId, [...ids]),
        isNotNull(notificationRecipient.readAt),
      ),
    )
    .run()
  return Number(result.changes)
}

export async function listThreadNotifications(db: Database, threadId: number): Promise<NotificationRow[]> {
  return sqliteOf(db).select().from(notification).where(eq(notification.threadId, threadId)).orderBy(notification.id)
}

export function findNotificationById(db: Database, id: number): NotificationRow | null {
  return sqliteOf(db).select().from(notification).where(eq(notification.id, id)).limit(1).all()[0] ?? null
}

export interface RecallNotificationResult {
  recalled: boolean
  row: NotificationRow
}

export function recallNotification(db: Database, id: number): RecallNotificationResult | null {
  const updated = sqliteOf(db)
    .update(notification)
    .set({ recalledAt: new Date() })
    .where(and(eq(notification.id, id), isNull(notification.recalledAt)))
    .returning()
    .all()
  const row = updated[0] ?? findNotificationById(db, id)
  return row === null ? null : { recalled: updated.length > 0, row }
}

export const NOTIFICATION_RETENTION_DAYS = 180

export interface NotificationPruneCounts {
  recipientsPruned: number
  notificationsPruned: number
}

export function pruneNotifications(db: Database, now: Date = new Date()): NotificationPruneCounts {
  const cutoff = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 86_400_000)
  return sqliteOf(db).transaction((tx) => {
    const agedMessageIds = tx
      .select({ id: notification.id })
      .from(notification)
      .where(lt(notification.createdAt, cutoff))
    const recipients = tx
      .delete(notificationRecipient)
      .where(
        and(isNotNull(notificationRecipient.readAt), inArray(notificationRecipient.notificationId, agedMessageIds)),
      )
      .run()
    const remainingRecipientMessageIds = tx
      .select({ notificationId: notificationRecipient.notificationId })
      .from(notificationRecipient)
    const roots = tx
      .delete(notification)
      .where(
        and(
          or(isNotNull(notification.recalledAt), lt(notification.createdAt, cutoff)),
          notInArray(notification.id, remainingRecipientMessageIds),
        ),
      )
      .run()
    return { recipientsPruned: Number(recipients.changes), notificationsPruned: Number(roots.changes) }
  })
}
