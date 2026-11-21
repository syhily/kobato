import { NEWSLETTER_SUBSCRIBER_STATUSES } from '@kobato/db/schema/shared'
import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const newsletterSubscriber = sqliteTable(
  'newsletter_subscriber',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    email: text('email').notNull(),
    status: text('status', { enum: NEWSLETTER_SUBSCRIBER_STATUSES }).notNull(),
    confirmTokenHash: text('confirm_token_hash'),
    confirmTokenExpiresAt: integer('confirm_token_expires_at', { mode: 'timestamp_ms' }),
    confirmedAt: integer('confirmed_at', { mode: 'timestamp_ms' }),
    unsubscribedAt: integer('unsubscribed_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('uq_newsletter_subscriber_email').on(table.email),
    index('idx_newsletter_subscriber_status').on(table.status),
    index('idx_newsletter_subscriber_confirm_token_hash').on(table.confirmTokenHash),
    check('newsletter_subscriber_status_chk', sql`${table.status} IN ('pending', 'confirmed', 'unsubscribed')`),
  ],
)
