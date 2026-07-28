import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { NEWSLETTER_SUBSCRIBER_STATUSES } from '@/server/infra/db/schema/shared'

// Newsletter subscribers (double-opt-in). A row is created in `pending`
// status with a sha256-hashed confirm token; the only mail a pending row
// ever receives is the confirmation email. Confirming flips the row to
// `confirmed` and clears the token hash (single-use). One-click
// unsubscribe flips to `unsubscribed` and is idempotent — the row is kept
// so a re-subscribe is a state transition, not a new identity.
//
// Field design:
// - `email` is stored normalized (trimmed, lowercased) by the service
//   layer; the UNIQUE index is the dedupe backstop under concurrent
//   subscribes.
// - `confirmTokenHash` / `confirmTokenExpiresAt` are NULL unless the row
//   is `pending`. Tokens live on the subscriber row (not the shared
//   `verification` table) because subscribers are not users — that table
//   keys on `user_id integer`.
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
