import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const NOTIFICATION_KINDS = ['direct', 'admin', 'broadcast'] as const
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

const sqlEnumList = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(', '))

export const notification = sqliteTable(
  'notification',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    threadId: integer('thread_id').notNull(),
    kind: text('kind').$type<NotificationKind>().notNull(),
    senderId: integer('sender_id'),
    title: text('title').notNull(),
    body: text('body').notNull(),
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
    recalledAt: integer('recalled_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    check('notification_kind_chk', sql`${table.kind} IN (${sqlEnumList(NOTIFICATION_KINDS)})`),
    index('idx_notification_thread').on(table.threadId, table.id),
  ],
)

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
    index('idx_notification_recipient_user_nid').on(table.userId, table.notificationId),
  ],
)
