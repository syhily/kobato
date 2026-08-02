import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { WEBMENTION_OUTBOX_STATUSES, WEBMENTION_STATUSES, WEBMENTION_TYPES } from '@/server/infra/db/schema/shared'

// Webmentions (W3C Webmention, receive side). A row is created in
// `pending` status only after the endpoint has fetched `sourceUrl` and
// verified it links to `targetUrl`; moderation then flips the row to
// `approved` / `rejected` (both kept — the row is the audit trail).
//
// - `authorName` / `title` / `summary` are best-effort extractions from
//   the source HTML; `type` is the mf2 classification (reply / like /
//   repost markers on the source anchor, `mention` otherwise) detected
//   at the same time — presentational grouping only, refreshed on every
//   re-mention like the rest of the extraction.
// - `rawPayload` is the verbatim form payload as received
//   (`{ source, target }`) — the fetched HTML is never persisted.
// - UNIQUE(source_url, target_url) is the physical dedup: a re-mention
//   (the source author edited their post and re-sent) is an upsert that
//   refreshes the extracted metadata — `pending` stays pending,
//   `approved` demotes back to `pending` for re-review, `rejected` stays
//   rejected (a spammer must not edit their way around moderation).
//   `source_url` is stored normalized via `normalizeForMatch` (fragment /
//   default port / path trailing slashes stripped), so those variants
//   converge onto one row; scheme and query differences do not.
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
    check('webmention_status_chk', sql`${table.status} IN ('pending', 'approved', 'rejected')`),
    check('webmention_type_chk', sql`${table.type} IN ('mention', 'reply', 'like', 'repost')`),
  ],
)

// Webmention outbox (W3C Webmention, SEND side — the outbound mirror of
// the table above). A row is enqueued when a published post body links to
// an external URL; the worker discovers the target's endpoint, POSTs the
// mention, and drives the row to a terminal status. Terminal rows are
// kept — the row is the send log surfaced read-only in the admin shell.
//
// - `endpoint` is the discovered endpoint and doubles as the discovery
//   cache: `null` means discovery has not run (or is being retried).
// - `nextRetryAt` is the worker's waterline (`NULL` = send immediately);
//   the pick query is `status='pending' AND (nextRetryAt IS NULL OR
//   nextRetryAt <= now)`.
// - UNIQUE(source_url, target_url) is the physical dedup: re-enqueue is an
//   upsert that resets `no-endpoint` / `failed` but never `sent`.
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

// Webmention inbox queue (W3C Webmention, receive side — the async
// verification queue, docs/plans/2026-08-02-webmention-async-inbox-design.md).
// The endpoint enqueues a row
// and returns 202 immediately; the worker then fetches the source,
// verifies the link, and lands the mention in the `webmention` table.
// There is NO status column: every row is awaiting verification, success
// DELETES the row, and terminal failures (target gone, source does not
// link, 4xx, blocked host) delete it too — only transient fetch errors
// (timeout / network / 5xx) retry on the `next_retry_at` waterline.
//
// - UNIQUE(source_url, target_url) is the queue dedup: a repeat POST
//   while a row is queued resets attempts and re-arms it for immediate
//   processing instead of piling up duplicate work. Both URLs are stored
//   normalized (`normalizeForMatch` / canonical target), so the variants
//   the receive side converges converge here too.
// - Verified source HTML is never persisted here — the queue carries
//   only the pair to check and the retry bookkeeping.
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
