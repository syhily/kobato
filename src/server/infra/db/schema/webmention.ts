import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { WEBMENTION_STATUSES } from '@/server/infra/db/schema/shared'

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
