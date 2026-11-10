import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { NOTIFICATION_KINDS, type NotificationKind } from '@/shared/contracts/notifications'

// Single source: the CHECK enum is generated from the wire contract's
// constant array (same pattern as schema/job-run.ts).
const sqlEnumList = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(', '))

// Notification center — one row per message. Root messages carry
// `threadId = id` (backfilled in the same sync transaction); replies reuse
// the root's threadId. `senderId` NULL means "system-generated" (boot
// cleanups, background jobs). `source` tags the producer for icons/links.
export const notification = sqliteTable(
  'notification',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    threadId: integer('thread_id').notNull(),
    kind: text('kind').$type<NotificationKind>().notNull(),
    senderId: integer('sender_id'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    // System-notification i18n descriptor: `title`/`body` hold the creation-time
    // ENGLISH fallback; these nullable columns let read paths translate per
    // reader locale (direct/broadcast keep NULL — user text stays raw). Params
    // are plain JSON text, never `{ mode: 'json' }`: a corrupt value must fall
    // back, not throw while mapping the row. `notification.*` keys are append-only.
    titleKey: text('title_key'),
    titleParams: text('title_params'),
    bodyKey: text('body_key'),
    bodyParams: text('body_params'),
    replyable: integer('replyable', { mode: 'boolean' }).default(false).notNull(),
    source: text('source'),
    actionUrl: text('action_url'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    // Soft-delete marker for admin recall. Rows stay in place — every read
    // path filters `recalled_at IS NULL`; NULL = visible.
    recalledAt: integer('recalled_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    check('notification_kind_chk', sql`${table.kind} IN (${sqlEnumList(NOTIFICATION_KINDS)})`),
    index('idx_notification_thread').on(table.threadId, table.id),
  ],
)

// Fan-out recipient rows, written once at message creation (later-registered
// users never see historical broadcasts). `readAt` NULL = unread; the unread
// badge counts exactly these rows.
export const notificationRecipient = sqliteTable(
  'notification_recipient',
  {
    notificationId: integer('notification_id').notNull(),
    userId: integer('user_id').notNull(),
    readAt: integer('read_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('uq_notification_recipient').on(table.notificationId, table.userId),
    index('idx_notification_recipient_user').on(table.userId, table.readAt),
    // Inbox ordering index: the list sorts by message id DESC, so the
    // user-prefixed column order lets the planner scan backwards instead of
    // sorting the user's whole history in a temp B-tree.
    index('idx_notification_recipient_user_nid').on(table.userId, table.notificationId),
  ],
)
