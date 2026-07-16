import { bigserial, index, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'

import { newsletterSubscriberStatusEnum } from '@/server/infra/db/schema/shared'

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
//   keys on `user_id bigint`.
export const newsletterSubscriber = pgTable(
  'newsletter_subscriber',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    email: varchar('email', { length: 255 }).notNull(),
    status: newsletterSubscriberStatusEnum('status').notNull(),
    confirmTokenHash: text('confirm_token_hash'),
    confirmTokenExpiresAt: timestamp('confirm_token_expires_at', { withTimezone: true, mode: 'date' }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'date' }),
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('uq_newsletter_subscriber_email').on(table.email),
    index('idx_newsletter_subscriber_status').on(table.status),
    index('idx_newsletter_subscriber_confirm_token_hash').on(table.confirmTokenHash),
  ],
)
