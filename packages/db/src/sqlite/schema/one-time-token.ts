import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const oneTimeToken = sqliteTable(
  'one_time_token',
  {
    key: text('key').primaryKey(),
    payload: text('payload', { mode: 'json' }).notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('idx_one_time_token_expires_at').on(table.expiresAt)],
)
