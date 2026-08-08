import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'

import type { StorageDriver } from '@/shared/config/types'

// Self-hosted web-font packages (cn-font-split), served via a self-hosted
// <link> (`cssKey` is the public entry point) so no external font origin
// enters the CSP. `hash` = sha256 of the source file (unique dedup key), `etag` = sha256 of `result.css` (cache-buster).
export const font = sqliteTable(
  'font',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    familyName: text('family_name').notNull(),
    sourceName: text('source_name').notNull(),
    hash: text('hash').notNull().unique(),
    cssKey: text('css_key').notNull(),
    storageDriver: text('storage_driver').$type<StorageDriver>().notNull(),
    chunkCount: integer('chunk_count').notNull(),
    totalBytes: integer('total_bytes').notNull(),
    etag: text('etag').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('font_family_idx').on(table.familyName)],
)

export type FontRow = typeof font.$inferSelect
export type NewFontRow = typeof font.$inferInsert
