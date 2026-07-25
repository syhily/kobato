import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Buffer } from 'node:buffer'
import type { SuperJSONResult } from 'superjson'

import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm'
import superjson from 'superjson'

import { kvCache } from '@/server/infra/db/schema/kv-cache'
import { escapeLikePattern } from '@/shared/utils/escape-like'
import { isRecord } from '@/shared/utils/type-guards'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

/**
 * Postgres-backed cache facade mirroring the old Redis `storage` object's
 * method shapes — but every function takes the Drizzle `db` as its first
 * parameter and rows live in the `kv_cache` table instead of a Redis
 * keyspace.
 *
 * JSON payloads are superjson-serialized into the `value` JSONB column —
 * structured storage, so `serialize`/`deserialize` rather than the
 * string-oriented `stringify`/`parse` pair the Redis wrapper uses. Binary
 * payloads go to the `blob` BYTEA column. A row holds one or the other:
 * both writers null out the sibling column so an overwrite never leaves a
 * stale payload of the other kind behind.
 */

export interface KvStoreSetOptions {
  /** Time-to-live in seconds. Omit for an entry that never expires. */
  ttlSeconds?: number
  /** Bucket label surfaced by the admin cache panel. Defaults to 'misc'. */
  bucket?: string
}

const DEFAULT_BUCKET = 'misc'

// Lazy expiry: a row is live only when it has no expiry or its expiry is
// still in the future. The hourly sweep in `kv-maintenance.ts` deletes
// expired rows; until it runs, every read must filter them out.
function liveEntries() {
  return or(isNull(kvCache.expiresAt), gt(kvCache.expiresAt, new Date()))
}

function expiryFrom(opts: KvStoreSetOptions): Date | null {
  return opts.ttlSeconds ? new Date(Date.now() + opts.ttlSeconds * 1000) : null
}

// The JSONB round-trip preserves exactly the object `superjson.serialize`
// produced, so the cast to SuperJSONResult is shape-safe. `deserialize`
// still sits behind try/catch because a hand-edited or partially-migrated
// row can be malformed — a bad entry reads as a miss, same as the Redis
// wrapper's parse failure.
function deserializeValue<T>(value: unknown): T | null {
  // Rows written by `setItem` always carry the superjson envelope
  // (`{ json, meta? }`). Anything else in the column — a hand edit, or a
  // raw scalar written by direct SQL (e.g. the search generation
  // counter) — is not ours to decode and reads as a miss.
  if (!isRecord(value) || !('json' in value)) {
    return null
  }
  try {
    const result = superjson.deserialize<T>(unsafeCast<SuperJSONResult>(value))
    return result === undefined ? null : result
  } catch {
    return null
  }
}

export async function getItem<T>(db: NodePgDatabase, key: string): Promise<T | null> {
  const rows = await db
    .select({ value: kvCache.value })
    .from(kvCache)
    .where(and(eq(kvCache.key, key), liveEntries()))
    .limit(1)
  const row = rows[0]
  if (!row) {
    return null
  }
  return deserializeValue<T>(row.value)
}

export async function setItem(
  db: NodePgDatabase,
  key: string,
  value: unknown,
  opts: KvStoreSetOptions = {},
): Promise<void> {
  const serialized = superjson.serialize(value)
  const expiresAt = expiryFrom(opts)
  const bucket = opts.bucket ?? DEFAULT_BUCKET
  await db
    .insert(kvCache)
    .values({ key, bucket, value: serialized, blob: null, expiresAt })
    .onConflictDoUpdate({
      target: kvCache.key,
      set: { bucket, value: serialized, blob: null, expiresAt },
    })
}

export async function getItemRaw(db: NodePgDatabase, key: string): Promise<Buffer | null> {
  const rows = await db
    .select({ blob: kvCache.blob })
    .from(kvCache)
    .where(and(eq(kvCache.key, key), liveEntries()))
    .limit(1)
  return rows[0]?.blob ?? null
}

export async function setItemRaw(
  db: NodePgDatabase,
  key: string,
  value: Buffer,
  opts: KvStoreSetOptions = {},
): Promise<void> {
  const expiresAt = expiryFrom(opts)
  const bucket = opts.bucket ?? DEFAULT_BUCKET
  await db
    .insert(kvCache)
    .values({ key, bucket, value: null, blob: value, expiresAt })
    .onConflictDoUpdate({
      target: kvCache.key,
      set: { bucket, value: null, blob: value, expiresAt },
    })
}

export async function removeItem(db: NodePgDatabase, key: string): Promise<void> {
  await db.delete(kvCache).where(eq(kvCache.key, key))
}

export async function getItems<T>(db: NodePgDatabase, keys: string[]): Promise<{ key: string; value: T | null }[]> {
  if (keys.length === 0) {
    return []
  }
  const rows = await db
    .select({ key: kvCache.key, value: kvCache.value })
    .from(kvCache)
    .where(and(inArray(kvCache.key, keys), liveEntries()))
  const byKey = new Map(rows.map((row) => [row.key, row.value]))
  // Result order follows the input keys (MGET semantics); missing or
  // expired keys come back as null values.
  return keys.map((key) => ({ key, value: deserializeValue<T>(byKey.get(key) ?? null) }))
}

export async function getKeys(db: NodePgDatabase, prefix?: string, maxCount = 10_000): Promise<string[]> {
  const pattern = prefix === undefined ? '%' : `${escapeLikePattern(prefix)}%`
  const rows = await db
    .select({ key: kvCache.key })
    .from(kvCache)
    .where(and(sql`${kvCache.key} LIKE ${pattern} ESCAPE '\\'`, liveEntries()))
    .orderBy(kvCache.key)
    .limit(maxCount)
  return rows.map((row) => row.key)
}
