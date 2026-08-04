import type { StorageDriver } from '@kobato/shared/config/types'

import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { randomUUID } from 'node:crypto'

// Self-hosted web-font packages produced by cn-font-split. Each row is a
// single uploaded `.ttf`/`.otf` that was sliced into many small woff2
// chunks server-side and written through the storage abstraction (local or
// S3). The browser loads one self-hosted `<link rel="stylesheet">` per
// package via `cssKey`, so no external font origin ever enters the CSP.
//
// Field design:
// - `hash` is the sha256 of the *source* TTF/OTF bytes — content-addressed
//   dedup key. Re-uploading the same file returns the existing row without
//   re-slicing. The unique constraint is what makes `putFont` idempotent.
// - `cssKey` is the storage key of the generated `result.css`
//   (`fonts/<hash>/result.css`). It is the single public entry point the
//   SSR `<link>` points at; the woff2 chunks it references are resolved
//   relatively from the same prefix.
// - No `status` / `slot` column. A row is only inserted after the
//   synchronous slice+store cycle succeeds (so there is no `processing` /
//   `failed` state to track), and slot membership lives in the settings
//   row (a font can belong to zero, one, or multiple slots), so slot is
//   reference-counted at the service layer rather than stored here.
// - `etag` is the sha256 of `result.css`, used as the cache-busting query
//   string on the `<link>` URL so repackaging a font busts browser/CDN
//   caches without changing the key.
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
