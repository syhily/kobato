import { sql } from 'drizzle-orm'
import { bigint, bigserial, index, jsonb, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'

import { webmentionStatusEnum } from '@/server/infra/db/schema/shared'

// Webmentions (W3C Webmention, receive side). A row is created in
// `pending` status only after the endpoint has fetched `sourceUrl` and
// verified it links to `targetUrl`; moderation then flips the row to
// `approved` / `rejected` (both kept — the row is the audit trail).
//
// Field design:
// - `targetUrl` is the canonical site URL the mention verified against;
//   `targetType` / `targetOwnerId` pin it to the live post/page row so
//   moderation survives slug edits.
// - `authorName` / `title` / `summary` are best-effort extractions from
//   the source HTML (microformats2 parsing is Phase 2).
// - `rawPayload` is the verbatim form payload as received
//   (`{ source, target }`) — intentionally tiny; the fetched HTML is
//   never persisted.
// - No UNIQUE(source_url, target_url): re-mention update semantics are
//   Phase 2, so duplicates land as separate pending rows for now.
export const webmention = pgTable(
  'webmention',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .$defaultFn(() => new Date()),
    sourceUrl: text('source_url').notNull(),
    targetUrl: text('target_url').notNull(),
    status: webmentionStatusEnum('status').notNull().default('pending'),
    targetType: varchar('target_type', { length: 16 }).$type<'post' | 'page'>().notNull(),
    targetOwnerId: bigint('target_owner_id', { mode: 'bigint' }).notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'date' }),
    authorName: varchar('author_name', { length: 200 }),
    title: text('title'),
    summary: text('summary'),
    rawPayload: jsonb('raw_payload')
      .$type<{ source: string; target: string }>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    moderatedAt: timestamp('moderated_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('idx_webmention_status').on(table.status),
    index('idx_webmention_target').on(table.targetType, table.targetOwnerId),
  ],
)
