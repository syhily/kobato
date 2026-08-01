import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

import { WEBMENTION_OUTBOX_STATUSES, WEBMENTION_STATUSES } from '@/server/infra/db/schema/shared'

// Webmentions (W3C Webmention, receive side). A row is created in
// `pending` status only after the endpoint has fetched `sourceUrl` and
// verified it links to `targetUrl`; moderation then flips the row to
// `approved` / `rejected` (both kept — the row is the audit trail).
//
// - `authorName` / `title` / `summary` are best-effort extractions from
//   the source HTML.
// - `rawPayload` is the verbatim form payload as received
//   (`{ source, target }`) — the fetched HTML is never persisted.
// - No UNIQUE(source_url, target_url): re-mention update semantics are
//   not implemented; duplicates land as separate pending rows.
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
    index('idx_webmention_status').on(table.status),
    index('idx_webmention_target').on(table.targetType, table.targetOwnerId),
    check('webmention_status_chk', sql`${table.status} IN ('pending', 'approved', 'rejected')`),
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
