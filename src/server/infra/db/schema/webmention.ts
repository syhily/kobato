import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import {
  WEBMENTION_OUTBOX_STATUSES,
  WEBMENTION_STATUSES,
  WEBMENTION_TYPES,
  WEBMENTION_VERIFY_STATUSES,
} from '@/server/infra/db/schema/shared'

// Webmentions (W3C Webmention, receive side): rows land `pending` after
// source verification, then moderation flips them `approved`/`rejected`;
// 7 consecutive daily re-verification failures hide an `approved` row.
// UNIQUE(source_url, target_url) is the dedup: a re-mention upserts —
// `approved` demotes to `pending` for re-review, `rejected` stays.
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
    fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }),
    verificationStatus: text('verification_status', { enum: WEBMENTION_VERIFY_STATUSES }).notNull().default('verified'),
    lastVerifiedAt: integer('last_verified_at', { mode: 'timestamp_ms' }),
    lastError: text('last_error'),
    verifyFailStreak: integer('verify_fail_streak').notNull().default(0),
    authorName: text('author_name'),
    title: text('title'),
    summary: text('summary'),
    rawPayload: text('raw_payload', { mode: 'json' })
      .$type<{ source: string; target: string }>()
      .notNull()
      .$defaultFn(() => ({ source: '', target: '' })),
    moderatedAt: integer('moderated_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('uq_webmention_pair').on(table.sourceUrl, table.targetUrl),
    index('idx_webmention_status').on(table.status),
    index('idx_webmention_target').on(table.targetType, table.targetOwnerId),
    check('webmention_status_chk', sql`${table.status} IN ('pending', 'approved', 'rejected', 'hidden')`),
    check('webmention_type_chk', sql`${table.type} IN ('mention', 'reply', 'like', 'repost')`),
    check('webmention_verification_chk', sql`${table.verificationStatus} IN ('verified', 'failed')`),
  ],
)

// Webmention outbox (W3C Webmention, SEND side): the worker discovers
// the endpoint, POSTs the mention, and drives the row to a terminal
// status, kept as the send log. UNIQUE(source_url, target_url) dedup: a
// re-enqueue resets `no-endpoint`/`failed` but never `sent`.
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
    check('webmention_outbox_status_chk', sql`${table.status} IN ('pending', 'sent', 'no-endpoint', 'failed')`),
  ],
)

// Webmention inbox queue (receive side, async verification —
// docs/plans/2026-08-02-webmention-async-inbox-design.md). The endpoint
// enqueues and returns 202; the worker verifies and lands the mention in
// `webmention`. No status column: success and terminal failures DELETE
// the row, only transient fetch errors retry on `next_retry_at`.
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
