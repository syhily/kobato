import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// One-shot tokens (setup token, passkey registration/authentication
// challenges, comment tokens) — the PG replacement for Redis keys consumed
// via GET-and-DEL. Consumption is a single `DELETE … RETURNING payload`
// statement so the atomic no-replay semantics carry over.
export const oneTimeToken = pgTable(
  'one_time_token',
  {
    key: text('key').primaryKey(),
    payload: jsonb('payload').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [index('idx_one_time_token_expires_at').on(table.expiresAt)],
)
