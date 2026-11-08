import { and, count, desc, eq, inArray, isNotNull, isNull, lt, notInArray, or, type SQL } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { NewNotificationRecipient, NotificationRecipientRow, NotificationRow } from '@/server/infra/db/types'
import type { NotificationKind } from '@/shared/contracts/notifications'

import { notification, notificationRecipient } from '@/server/infra/db/schema/notification'
import { user } from '@/server/infra/db/schema/user'

/**
 * Recipient rows per INSERT. SQLite binds at most 32 766 variables per
 * statement; at 3 columns per row a single broadcast insert died past
 * ~10 922 recipients. 500 keeps the statement far under the ceiling while
 * staying inside ONE transaction (atomicity preserved).
 */
const FAN_OUT_CHUNK_SIZE = 500

export interface NewNotificationRow {
  kind: NotificationKind
  senderId: number | null
  /** English fallback (`titleKey` resolves at read time) or the user's original text. */
  title: string
  body: string
  /** System-notification descriptor; NULL for direct/broadcast rows. */
  titleKey?: string | null
  titleParams?: string | null
  bodyKey?: string | null
  bodyParams?: string | null
  replyable: boolean
  source?: string | null
  actionUrl?: string | null
}

/**
 * Insert the message and its fan-out recipient rows in ONE sync transaction;
 * the root's `threadId` backfills to its own id (replies pass the root id in
 * `data.threadId` via the `threadId` argument instead). `readRecipientIds`
 * marks those recipients' rows read at insert (the replier's own copy of a
 * forked thread — visible in their inbox without inflating the badge).
 */
export function createNotificationWithRecipients(
  db: Database,
  data: NewNotificationRow & { threadId?: number },
  recipientIds: readonly number[],
  options?: { readRecipientIds?: readonly number[] },
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
  /** Page anchor: only messages with id < cursor. */
  cursorId?: number
  limit: number
}

// Inbox listing, newest first; the cursor paginates by message id. Recalled
// messages (ADR-0007) are invisible to every recipient. Ordering by the
// RECIPIENT's notification id (equal to the joined message id) is what the
// `(user_id, notification_id)` index feeds — ordering by `notification.id`
// sorted the user's whole history in a temp B-tree.
export async function listNotificationsForUser(
  db: Database,
  userId: number,
  filters: InboxFilters,
): Promise<NotificationInboxRow[]> {
  return notificationInboxQuery(db, userId, filters)
}

/** The inbox read, unexecuted — its access path (no temp B-tree) is pinned by
 *  `tests/it/server/domains/notifications/service.test.ts`. */
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
  return db
    .select({ message: notification, recipient: notificationRecipient })
    .from(notificationRecipient)
    .innerJoin(notification, eq(notificationRecipient.notificationId, notification.id))
    .where(and(...conditions))
    .orderBy(desc(notificationRecipient.notificationId))
    .limit(filters.limit)
}

/**
 * The badge count. Recalled messages join out (ADR-0007): the recipient index
 * still narrows to the user's unread rows, and each surviving row probes the
 * message's PRIMARY KEY — bounded by one user's unread count.
 */
export function countUnreadNotifications(db: Database, userId: number): number {
  const rows = db
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

/**
 * The inverse: return rows to unread. `readAt IS NOT NULL` keeps it
 * idempotent — a double click touches 0 rows the second time.
 */
export function markNotificationsUnread(db: Database, userId: number, ids: readonly number[]): number {
  const result = db
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
  // Recalled rows stay in the table (audit evidence, reversible) — the read
  // paths that must hide them gate on `recalledAt` themselves, so thread
  // loading can still find the root and refuse replies honestly.
  return db.select().from(notification).where(eq(notification.threadId, threadId)).orderBy(notification.id)
}

export function findNotificationById(db: Database, id: number): NotificationRow | null {
  return db.select().from(notification).where(eq(notification.id, id)).limit(1).all()[0] ?? null
}

export interface RecallNotificationResult {
  /** True only for the call that actually set the flag. */
  recalled: boolean
  row: NotificationRow
}

/**
 * Idempotent soft delete (ADR-0007): `recalled_at` is written once and never
 * overwritten. A repeated call touches no row and reports the current state.
 */
export function recallNotification(db: Database, id: number): RecallNotificationResult | null {
  const updated = db
    .update(notification)
    .set({ recalledAt: new Date() })
    .where(and(eq(notification.id, id), isNull(notification.recalledAt)))
    .returning()
    .all()
  const row = updated[0] ?? findNotificationById(db, id)
  return row === null ? null : { recalled: updated.length > 0, row }
}

/** Distinct ACTIVE senders + recipients across the whole thread — the reply routing base. */
export function listThreadParticipantIds(db: Database, threadId: number): number[] {
  const participants = new Set<number>()
  const messages = db
    .select({ senderId: notification.senderId })
    .from(notification)
    .innerJoin(user, eq(notification.senderId, user.id))
    .where(and(eq(notification.threadId, threadId), isNotNull(notification.senderId), isNull(user.deletedAt)))
    .all()
  for (const message of messages) {
    participants.add(message.senderId!)
  }
  const recipients = db
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

/**
 * Membership probe for the thread gate — two early-return LIMIT 1 lookups so
 * opening a broadcast-sized thread never materializes its whole audience.
 */
export function isThreadParticipant(db: Database, threadId: number, userId: number): boolean {
  const sent = db
    .select({ id: notification.id })
    .from(notification)
    .where(and(eq(notification.threadId, threadId), eq(notification.senderId, userId)))
    .limit(1)
    .all()
  if (sent.length > 0) {
    return true
  }
  const received = db
    .select({ notificationId: notificationRecipient.notificationId })
    .from(notificationRecipient)
    .innerJoin(notification, eq(notificationRecipient.notificationId, notification.id))
    .where(and(eq(notification.threadId, threadId), eq(notificationRecipient.userId, userId)))
    .limit(1)
    .all()
  return received.length > 0
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

/** Targeted probe for the SAME active-user predicate `listRecipientUserIds` applies. */
export function isActiveUserId(db: Database, userId: number): boolean {
  const rows = db
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
  const rows = db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, [...ids]))
    .all()
  return new Map(rows.map((row) => [row.id, row.name]))
}

/** Recipient email lookup for notification emails (ADR-0008). Callers pass already-active recipient ids. */
export function findUserEmailsByIds(db: Database, ids: readonly number[]): Map<number, string> {
  if (ids.length === 0) {
    return new Map()
  }
  const rows = db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(inArray(user.id, [...ids]))
    .all()
  return new Map(rows.map((row) => [row.id, row.email]))
}

/**
 * Retention: READ recipient rows whose MESSAGE is older than this are pruned
 * by the daily maintenance. 180 days matches the analytics lifetime
 * (`ACCESS_EVENTS_RETENTION_DAYS`), the number this repo already treats as
 * "how long user data lives" (ADR-0010).
 */
export const NOTIFICATION_RETENTION_DAYS = 180

export interface NotificationPruneCounts {
  recipientsPruned: number
  notificationsPruned: number
}

/**
 * Retention prune (daily maintenance, ADR-0010): delete READ recipient rows
 * whose message is older than {@link NOTIFICATION_RETENTION_DAYS}, then
 * reclaim root messages left with no recipient row (recalled, or past the
 * same window). Age is ALWAYS the message's `created_at` — a message read
 * late is still an old message, and `notification_recipient` carries no
 * creation timestamp. Unread rows are never pruned. Runs in one sync
 * transaction; returns the deleted row counts. Throws on failure (the caller
 * logs).
 *
 * Takes the db explicitly — like `pruneJobRuns` — because the only caller
 * (`runDbMaintenance`) already holds the current handle.
 */
export function pruneNotifications(db: Database, now: Date = new Date()): NotificationPruneCounts {
  const cutoff = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 86_400_000)
  return db.transaction((tx) => {
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
    // Runs AFTER step 1 in the same transaction, so roots whose last
    // recipient rows were just deleted are reclaimed in this pass.
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
