import { sql } from 'drizzle-orm'
import { bigint, bigserial, boolean, index, pgTable, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core'

import { userRoleEnum } from '@/server/infra/db/schema/shared'

// RBAC role enum. Declared as a real Postgres ENUM (not a CHECK
// constraint or varchar+TS-only enforcement) so a stray
// `UPDATE user SET role = 'editor'` from a DB client is rejected at
// the DB perimeter. Adding a new role later is a separate migration
// (`ALTER TYPE user_role ADD VALUE`), which is a fair price for the
// stronger guarantee.

export const user = pgTable(
  'user',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).unique().notNull(),
    emailVerified: boolean('email_verified').default(false).notNull(),
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
    role: userRoleEnum('role'),
    isMuted: boolean('is_muted').default(false).notNull(),
    receiveEmail: boolean('receive_email').default(true),
    passkeyForce: boolean('passkey_force').default(false).notNull(),
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
  ],
)

// One-shot tokens for password reset and author invite. Previously
// the row identity was a single `identifier text` column shaped as
// `<purpose>:<userId>` — that conflated two concerns into one column,
// had no UNIQUE constraint, and forced bigint userIds through a
// string-split / parseInt detour. Splitting `purpose` and `userId`
// into two real columns lets the `(purpose, userId)` UNIQUE index do
// its job (one live token per purpose per user) and lets the
// application stay bigint end-to-end.
export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    purpose: varchar('purpose', { length: 32 }).notNull(),
    userId: bigint('user_id', { mode: 'bigint' }).notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at')
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at')
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_verification_value').on(table.value),
    index('idx_verification_expires_at').on(table.expiresAt),
    uniqueIndex('uq_verification_purpose_user').on(table.purpose, table.userId),
  ],
)
