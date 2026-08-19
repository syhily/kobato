import type { Buffer } from 'node:buffer'

import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { JsonValue } from '@/shared/utils/json-value'

import { kvCache } from '@/server/infra/db/schema/kv-cache'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

/**
 * SQLite row-access plane for `@/server/infra/cache/registry` — its only consumer.
 * JSON payloads ride the `value` json-mode column, binary payloads the `blob`
 * column; a row holds one or the other — writers null out the sibling column.
 */

export interface KvStoreSetOptions {
  /** Time-to-live in seconds. Omit for an entry that never expires. */
  ttlSeconds?: number
  /** Bucket label for the admin cache panel — required; every row lands in a declared bucket. */
  bucket: string
}

// Lazy expiry: every read must filter expired rows; the sweep only reclaims space.
function liveEntries() {
  return or(isNull(kvCache.expiresAt), gt(kvCache.expiresAt, new Date()))
}

function expiryFrom(opts: KvStoreSetOptions): Date | null {
  return opts.ttlSeconds ? new Date(Date.now() + opts.ttlSeconds * 1000) : null
}

// The json-mode column already parsed the text — the cast is the registry's schema contract.
function deserializeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null
  }
  return value
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
  return unsafeCast<T | null>(deserializeValue(row.value))
}

export async function setItem(db: Database, key: string, value: JsonValue, opts: KvStoreSetOptions): Promise<void> {
  // Plain JSON storage — the JsonValue bound (plan §1.12) makes a Date/bigint payload a compile error.
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

export async function getItems(db: Database, keys: string[]): Promise<{ key: string; value: unknown }[]> {
  if (keys.length === 0) {
    return []
  }
  const rows = await db
    .select({ key: kvCache.key, value: kvCache.value })
    .from(kvCache)
    .where(and(inArray(kvCache.key, keys), liveEntries()))
  const byKey = new Map(rows.map((row) => [row.key, row.value]))
  // Result order follows the input keys (MGET semantics); missing keys come back null.
  return keys.map((key) => ({ key, value: deserializeValue(byKey.get(key) ?? null) }))
}
