import { blob, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// General-purpose persistent cache. Metadata JSON in `value`, binary in
// `blob` — a row holds one or the other (writers null the sibling on
// overwrite). `expiresAt` NULL means never expires.
export const kvCache = sqliteTable(
  'kv_cache',
  {
    key: text('key').primaryKey(),
    bucket: text('bucket').notNull(),
    value: text('value', { mode: 'json' }),
    blob: blob('blob', { mode: 'buffer' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('idx_kv_cache_bucket').on(table.bucket), index('idx_kv_cache_expires_at').on(table.expiresAt)],
)
