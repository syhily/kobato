import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// One-shot tokens (setup, passkey challenges, comment tokens). Consumption
// is a single `DELETE … RETURNING payload` — atomic no-replay.
export const oneTimeToken = sqliteTable(
  'one_time_token',
  {
    key: text('key').primaryKey(),
    payload: text('payload', { mode: 'json' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('idx_one_time_token_expires_at').on(table.expiresAt)],
)
