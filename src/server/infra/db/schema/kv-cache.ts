import { blob, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// General-purpose persistent cache — the replacement for the Redis
// keyspace (feed/sitemap/taxonomy/comment caches, image-meta, search
// results, avatar/OG/calendar binaries). Metadata payloads live in
// `value` (plain JSON — superjson was dropped with the migration; dates
// are epoch ms numbers inside the payloads), binary payloads in `blob`;
// a row holds one or the other — the writers null out the sibling column
// on overwrite. `expiresAt` NULL means the entry never expires (e.g. the
// search generation counter); reads filter expired rows lazily and a
// periodic sweep deletes them.
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
