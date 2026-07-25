import { bigint, index, inet, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { user } from '@/server/infra/db/schema/user'

// Server-side session store — the PG replacement for the Redis
// `session:<sid>` payload / `session_meta:<sid>` hash / `user_sessions:<uid>`
// set trio. `userId` stays NULL while an OTP challenge is pending; the row
// only gains a user once login completes. `data` holds the superjson-
// serialized `BlogSessionData`; the meta fields are flat columns so session
// listing/revocation is a plain SELECT/UPDATE instead of HGETALL/HSET.
export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    userId: bigint('user_id', { mode: 'bigint' }).references(() => user.id, {
      onDelete: 'cascade',
    }),
    data: jsonb('data').notNull(),
    userAgent: text('user_agent'),
    platformHint: text('platform_hint'),
    ip: inet('ip'),
    loginAt: timestamp('login_at', { withTimezone: true, mode: 'date' }),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true, mode: 'date' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [index('idx_session_user_id').on(table.userId), index('idx_session_expires_at').on(table.expiresAt)],
)
