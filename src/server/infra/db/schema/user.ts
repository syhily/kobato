import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import type { LoginMethod } from '@/shared/contracts/users'

import { USER_ROLES } from '@/server/infra/db/schema/shared'

// RBAC role enum. `text({ enum })` constrains at the drizzle layer; the
// explicit CHECK below keeps the DB-perimeter guarantee the Postgres
// ENUM gave (a stray `UPDATE user SET role = 'editor'` from a DB client
// is rejected).

export const user = sqliteTable(
  'user',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    name: text('name').notNull(),
    email: text('email').unique().notNull(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
    link: text('link'),
    password: text('password').notNull(),
    badgeName: text('badge_name'),
    badgeColor: text('badge_color'),
    // Optional manual override for the badge text colour. When `null`
    // (the historical default for every existing row) the public
    // renderer falls back to `commentBadgeTextColor()`'s WCAG-based
    // auto-pick so older accounts keep working without an admin sweep.
    badgeTextColor: text('badge_text_color'),
    lastIp: text('last_ip'),
    lastUa: text('last_ua'),
    role: text('role', { enum: USER_ROLES }),
    isMuted: integer('is_muted', { mode: 'boolean' }).default(false).notNull(),
    receiveEmail: integer('receive_email', { mode: 'boolean' }).default(true),
    // Unified per-user signin method: 'password' (default), 'magic-link',
    // or 'passkey'.
    loginMethod: text('login_method').$type<LoginMethod>().default('password').notNull(),
  },
  (table) => [
    index('idx_users_email').on(table.email),
    index('idx_users_name').on(table.name),
    index('idx_users_deleted_at').on(table.deletedAt),
    // Partial: skip anonymous placeholder rows (role IS NULL) — they're 80%+
    // of the table on a mature install and have no role-based query needs.
    index('idx_user_role')
      .on(table.role)
      .where(sql`role IS NOT NULL`),
    check('user_role_chk', sql`${table.role} IN ('admin', 'author', 'visitor')`),
  ],
)

// One-shot tokens for password reset and author invite. Previously
// the row identity was a single `identifier text` column shaped as
// `<purpose>:<userId>` — that conflated two concerns into one column,
// had no UNIQUE constraint, and forced userIds through a string-split /
// parseInt detour. Splitting `purpose` and `userId` into two real
// columns lets the `(purpose, userId)` UNIQUE index do its job (one
// live token per purpose per user).
export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    purpose: text('purpose').notNull(),
    userId: integer('user_id').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_verification_value').on(table.value),
    index('idx_verification_expires_at').on(table.expiresAt),
    uniqueIndex('uq_verification_purpose_user').on(table.purpose, table.userId),
  ],
)
