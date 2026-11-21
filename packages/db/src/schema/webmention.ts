import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const WEBMENTION_STATUSES = ['pending', 'approved', 'rejected', 'hidden'] as const
export type WebmentionStatus = (typeof WEBMENTION_STATUSES)[number]

export const WEBMENTION_VERIFY_STATUSES = ['verified', 'failed'] as const
export type WebmentionVerifyStatus = (typeof WEBMENTION_VERIFY_STATUSES)[number]

export const WEBMENTION_TYPES = ['mention', 'reply', 'like', 'repost'] as const
export type WebmentionType = (typeof WEBMENTION_TYPES)[number]

export const WEBMENTION_OUTBOX_STATUSES = ['pending', 'sent', 'no-endpoint', 'failed'] as const
export type WebmentionOutboxStatus = (typeof WEBMENTION_OUTBOX_STATUSES)[number]

const sqlEnumList = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(', '))

export const webmention = sqliteTable(
  'webmention',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sourceUrl: text('source_url').notNull(),
    targetUrl: text('target_url').notNull(),
    status: text('status', { enum: WEBMENTION_STATUSES }).notNull().default('pending'),
    type: text('type', { enum: WEBMENTION_TYPES }).notNull().default('mention'),
    targetType: text('target_type').$type<'post' | 'page'>().notNull(),
    targetOwnerId: integer('target_owner_id').notNull(),
    verificationStatus: text('verification_status', { enum: WEBMENTION_VERIFY_STATUSES }).notNull().default('verified'),
    lastVerifiedAt: integer('last_verified_at', { mode: 'timestamp_ms' }),
    lastError: text('last_error'),
    verifyFailStreak: integer('verify_fail_streak').notNull().default(0),
    authorName: text('author_name'),
    title: text('title'),
    summary: text('summary'),
    moderatedAt: integer('moderated_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('uq_webmention_pair').on(table.sourceUrl, table.targetUrl),
    index('idx_webmention_status').on(table.status),
    index('idx_webmention_target').on(table.targetType, table.targetOwnerId),
    check('webmention_status_chk', sql`${table.status} IN (${sqlEnumList(WEBMENTION_STATUSES)})`),
    check('webmention_type_chk', sql`${table.type} IN (${sqlEnumList(WEBMENTION_TYPES)})`),
    check(
      'webmention_verification_chk',
      sql`${table.verificationStatus} IN (${sqlEnumList(WEBMENTION_VERIFY_STATUSES)})`,
    ),
  ],
)

export const webmentionOutbox = sqliteTable(
  'webmention_outbox',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sourceUrl: text('source_url').notNull(),
    targetUrl: text('target_url').notNull(),
    endpoint: text('endpoint'),
    status: text('status', { enum: WEBMENTION_OUTBOX_STATUSES }).notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextRetryAt: integer('next_retry_at', { mode: 'timestamp_ms' }),
    lastError: text('last_error'),
    sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('uq_webmention_outbox_pair').on(table.sourceUrl, table.targetUrl),
    index('idx_webmention_outbox_pick').on(table.status, table.nextRetryAt),
    index('idx_webmention_outbox_source').on(table.sourceUrl),
    check('webmention_outbox_status_chk', sql`${table.status} IN (${sqlEnumList(WEBMENTION_OUTBOX_STATUSES)})`),
  ],
)

export const webmentionInbox = sqliteTable(
  'webmention_inbox',
  {
    id: integer('id').primaryKey({ autoIncrement: true }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sourceUrl: text('source_url').notNull(),
    targetUrl: text('target_url').notNull(),
    attempts: integer('attempts').notNull().default(0),
    nextRetryAt: integer('next_retry_at', { mode: 'timestamp_ms' }),
    lastError: text('last_error'),
  },
  (table) => [
    uniqueIndex('uq_webmention_inbox_pair').on(table.sourceUrl, table.targetUrl),
    index('idx_webmention_inbox_pick').on(table.nextRetryAt),
  ],
)
