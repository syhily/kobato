import { user } from '@kobato/server/infra/db/schema/user'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Server-side session store — the replacement for the Redis
// `session:<sid>` payload / `session_meta:<sid>` hash / `user_sessions:<uid>`
// set trio. `userId` stays NULL while an OTP challenge is pending; the row
// only gains a user once login completes. `data` holds the plain-JSON
// `BlogSessionData` (superjson was dropped with the migration — every
// field is JSON-native); the meta fields are flat columns so session
// listing/revocation is a plain SELECT/UPDATE instead of HGETALL/HSET.
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
