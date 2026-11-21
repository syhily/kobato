import type { StorageDriver } from '@kobato/settings/types'

import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'

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
