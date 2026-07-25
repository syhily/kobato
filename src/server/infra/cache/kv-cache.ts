import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { ZodType } from 'zod'

import { getItem, removeItem, setItem } from '@/server/infra/cache/kv-store'

export interface KvCacheOptions<T> {
  ttlMs: number
  /** Optional Zod schema for forward-compatible deserialization.
   *  When provided, `get()` validates cached data against the schema so
   *  stale entries missing newly-added fields are treated as a cache miss
   *  instead of causing runtime errors. */
  schema?: ZodType<T>
}

/**
 * `createRedisCache` counterpart backed by the `kv_cache` table (see
 * `kv-store.ts`). Same get/set/clear shape with the same superjson
 * serialization and schema-mismatch eviction, but every method takes the
 * Drizzle `db` as its first parameter.
 */
export function createKvCache<T>(key: string, options: KvCacheOptions<T>) {
  const ttlSeconds = Math.max(1, Math.ceil(options.ttlMs / 1000))

  async function get(db: NodePgDatabase): Promise<T | null> {
    // Undeserializable rows already read as a miss inside `getItem`; the
    // hourly sweep reclaims them, so only a schema mismatch needs the
    // eager evict here.
    const parsed = await getItem<T>(db, key)
    if (parsed === null) {
      return null
    }
    if (options.schema) {
      const result = options.schema.safeParse(parsed)
      if (!result.success) {
        // Schema mismatch (e.g. new field added) — evict and treat as miss
        await removeItem(db, key)
        return null
      }
      return result.data
    }
    return parsed
  }

  async function set(db: NodePgDatabase, value: T): Promise<void> {
    await setItem(db, key, value, { ttlSeconds })
  }

  async function clear(db: NodePgDatabase): Promise<void> {
    await removeItem(db, key)
  }

  return { get, set, clear }
}
