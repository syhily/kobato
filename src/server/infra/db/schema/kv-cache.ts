import { bytea, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

// General-purpose persistent cache — the PG replacement for the Redis
// keyspace (feed/sitemap/taxonomy/comment caches, image-meta, embeddings,
// search results, avatar/OG/calendar binaries). Metadata payloads live in
// `value` (superjson-serialized), binary payloads in `blob`; a row holds
// one or the other — the writers null out the sibling column on overwrite.
// `expiresAt` NULL means the entry never expires (e.g. the search
// generation counter); reads filter expired rows lazily and a periodic
// sweep deletes them.
export const kvCache = pgTable(
  'kv_cache',
  {
    key: text('key').primaryKey(),
    bucket: text('bucket').notNull(),
    value: jsonb('value'),
    blob: bytea('blob'),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [index('idx_kv_cache_bucket').on(table.bucket), index('idx_kv_cache_expires_at').on(table.expiresAt)],
)
