import { user } from '@kobato/db/schema/user.ts'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    userId: integer('user_id').references(() => user.id, {
      onDelete: 'cascade',
    }),
    data: text('data', { mode: 'json' }).notNull(),
    userAgent: text('user_agent'),
    platformHint: text('platform_hint'),
    ip: text('ip'),
    loginAt: integer('login_at', { mode: 'timestamp_ms' }),
    lastActiveAt: integer('last_active_at', { mode: 'timestamp_ms' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('idx_session_user_id').on(table.userId), index('idx_session_expires_at').on(table.expiresAt)],
)
