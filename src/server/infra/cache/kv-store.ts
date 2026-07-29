import type { Buffer } from 'node:buffer'

import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { JsonValue } from '@/shared/utils/json-value'

import { kvCache } from '@/server/infra/db/schema/kv-cache'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

/**
 * SQLite-backed row-access plane for the cache module
 * (`@/server/infra/cache/registry`) — the ONLY consumer. JSON payloads
 * ride the `value` json-mode column as PLAIN JSON (superjson was dropped
 * with the SQLite migration: every bucket payload is JSON-native — the
 * one Date-bearing shape, image metadata, carries `updatedAtMs` as an
 * epoch number). Binary payloads go to the `blob` BLOB column. A row
 * holds one or the other: both writers null out the sibling column so an
 * overwrite never leaves a stale payload of the other kind behind.
 */

export interface KvStoreSetOptions {
  /** Time-to-live in seconds. Omit for an entry that never expires. */
  ttlSeconds?: number
  /** Bucket label surfaced by the admin cache panel — required so every
   *  row lands in a declared bucket (there is no misc bucket). */
  bucket: string
}

// Lazy expiry: a row is live only when it has no expiry or its expiry is
// still in the future. The hourly sweep in `kv-maintenance.ts` deletes
// expired rows; until it runs, every read must filter them out.
function liveEntries() {
  return or(isNull(kvCache.expiresAt), gt(kvCache.expiresAt, new Date()))
}

function expiryFrom(opts: KvStoreSetOptions): Date | null {
  return opts.ttlSeconds ? new Date(Date.now() + opts.ttlSeconds * 1000) : null
}

// The json-mode column already parsed the stored text, so the value
// comes back as plain JSON. The cast to T is the declaration's own
// contract (the registry validates reads against the bucket schema where
// one exists); `undefined` reads as a miss.
function deserializeValue<T>(value: unknown): T | null {
  if (value === null || value === undefined) {
    return null
  }
  return unsafeCast<T>(value)
}

export async function getItem<T>(db: Database, key: string): Promise<T | null> {
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

export async function setItem(db: Database, key: string, value: JsonValue, opts: KvStoreSetOptions): Promise<void> {
  // Plain JSON storage: the json-mode column serializes the value
  // itself, and the JsonValue bound (plan §1.12) makes a Date/bigint
  // payload a compile error at the call site.
  const serialized = value
  const expiresAt = expiryFrom(opts)
  await db
    .insert(kvCache)
    .values({ key, bucket: opts.bucket, value: serialized, blob: null, expiresAt })
    .onConflictDoUpdate({
      target: kvCache.key,
      set: { bucket: opts.bucket, value: serialized, blob: null, expiresAt },
    })
}

export async function getItemRaw(db: Database, key: string): Promise<Buffer | null> {
  const rows = await db
    .select({ blob: kvCache.blob })
    .from(kvCache)
    .where(and(eq(kvCache.key, key), liveEntries()))
    .limit(1)
  return rows[0]?.blob ?? null
}

export async function setItemRaw(db: Database, key: string, value: Buffer, opts: KvStoreSetOptions): Promise<void> {
  const expiresAt = expiryFrom(opts)
  await db
    .insert(kvCache)
    .values({ key, bucket: opts.bucket, value: null, blob: value, expiresAt })
    .onConflictDoUpdate({
      target: kvCache.key,
      set: { bucket: opts.bucket, value: null, blob: value, expiresAt },
    })
}

export async function removeItem(db: Database, key: string): Promise<void> {
  await db.delete(kvCache).where(eq(kvCache.key, key))
}

export async function getItems<T>(db: Database, keys: string[]): Promise<{ key: string; value: T | null }[]> {
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
