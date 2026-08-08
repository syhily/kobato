import type { ZodType } from 'zod'

import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

import type { Database } from '@/server/infra/db/database'
import type { CacheBucketId } from '@/shared/types/cache'
import type { JsonValue } from '@/shared/utils/json-value'

import { createInflight } from '@/server/infra/cache/inflight'
import { getItem, getItemRaw, getItems, removeItem, setItem, setItemRaw } from '@/server/infra/cache/kv-store'
import { kvCache } from '@/server/infra/db/schema/kv-cache'
import { getLogger } from '@/server/infra/logger'
import { CACHE_DECLARATIONS } from '@/shared/cache/registry'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { isTunableCacheBucket } from '@/shared/types/cache'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('cache')

/**
 * The cache behavior plane — the only module reading/writing `kv_cache` rows
 * (via `kv-store`). Best-effort: failures degrade to a miss / a skipped write —
 * the cache must never fail the request it serves; loader errors propagate.
 */

interface CacheParamsMap {
  og: { slug: string; title: string; summary: string; cover: string }
  calendar: { date: string; theme: 'light' | 'dark' }
  avatar: { size: number; email: string }
  imageMeta: { storagePath: string }
  searchResult: { generation: number; parts: readonly string[] }
  feed: { scope: string }
  sitemap: Record<string, never>
  categories: Record<string, never>
  tags: Record<string, never>
  comments: Record<string, never>
  githubRelease: { owner: string; repo: string; endpoint: string }
  githubAvatar: Record<string, never>
}

interface CacheBehavior<P> {
  kind: 'json' | 'binary'
  /** Key shape WITHOUT the prefix — the module prepends the resolved slot prefix. */
  key: (params: P) => string
  /** Forward-compat eviction for json entries: a stale shape reads as a miss. */
  schema?: ZodType
  /** Binary codecs; the default is a raw Buffer passthrough. */
  encode?: (value: unknown) => Buffer
  decode?: (raw: Buffer) => unknown
  /** Skip caching the loader result when this returns false. */
  cacheWhen?: (value: unknown) => boolean
  /** Dev mode re-runs the loader but still writes. */
  devBypass?: boolean
  /** Declares the `${prefix}generation` counter row. */
  counter?: boolean
}

// Byte 0 is the status sentinel: `HAVE_AVATAR` (0) = payload follows,
// `NO_AVATAR` (1) = negative, payload-less entry. The enum IS the
// persisted byte protocol — consumers import it from here.
export enum AvatarStatus {
  HAVE_AVATAR = 0,
  NO_AVATAR = 1,
}

/** The avatar bucket's decoded entry shape — what `get` returns and `set` stores. */
export interface AvatarEntry {
  status: AvatarStatus
  buffer: Buffer | null
}

function encodeAvatar(value: unknown): Buffer {
  // The avatar declaration only ever stores AvatarEntry values.
  const entry = unsafeCast<AvatarEntry>(value)
  if (entry.status === AvatarStatus.NO_AVATAR || entry.buffer === null) {
    return Buffer.from([AvatarStatus.NO_AVATAR])
  }
  const out = Buffer.allocUnsafe(entry.buffer.length + 1)
  out[0] = AvatarStatus.HAVE_AVATAR
  entry.buffer.copy(out, 1)
  return out
}

function decodeAvatar(raw: Buffer): AvatarEntry | null {
  if (raw.length === 0) {
    return null
  }
  const sentinel = unsafeCast<AvatarStatus>(raw[0])
  if (sentinel === AvatarStatus.NO_AVATAR) {
    return { status: AvatarStatus.NO_AVATAR, buffer: null }
  }
  if (sentinel === AvatarStatus.HAVE_AVATAR) {
    // subarray shares the backing Buffer — the cast only re-narrows the type.
    return { status: AvatarStatus.HAVE_AVATAR, buffer: unsafeCast<Buffer>(raw.subarray(1)) }
  }
  return null
}

const BEHAVIORS: { [K in CacheBucketId]: CacheBehavior<CacheParamsMap[K]> } = {
  og: {
    kind: 'binary',
    devBypass: true,
    // Hash of every render input — an edit produces a fresh entry, never a stale render.
    key: ({ slug, title, summary, cover }) =>
      `${slug}-${createHash('sha1').update(`${title}\u0001${summary}\u0001${cover}`).digest('hex').slice(0, 16)}`,
  },
  calendar: {
    kind: 'binary',
    devBypass: true,
    // `-dark` suffix keeps the two themes from clobbering each other.
    key: ({ date, theme }) => `${date}${theme === 'dark' ? '-dark' : ''}`,
  },
  // Size is part of the key — a cached entry must never serve a different `?s=` request.
  avatar: {
    kind: 'binary',
    key: ({ size, email }) => `${size}:${email}`,
    encode: encodeAvatar,
    decode: decodeAvatar,
  },
  imageMeta: {
    kind: 'json',
    key: ({ storagePath }) => storagePath,
  },
  searchResult: {
    kind: 'json',
    counter: true,
    // Every key carries the generation; bumping orphans older entries (they expire by TTL).
    key: ({ generation, parts }) => `${generation}:${createHash('sha256').update(parts.join('|')).digest('hex')}`,
    // Empty result lists are never cached — a later corpus match must not be shadowed.
    cacheWhen: (value) => Array.isArray(value) && value.length > 0,
  },
  feed: {
    kind: 'json',
    key: ({ scope }) => scope,
  },
  sitemap: {
    kind: 'json',
    key: () => '',
  },
  categories: {
    kind: 'json',
    key: () => 'all',
  },
  tags: {
    kind: 'json',
    key: () => 'all',
  },
  comments: {
    kind: 'json',
    key: () => 'latest',
  },
  // Key carries the full request target — a repo or endpoint change can't serve a stale hit.
  githubRelease: {
    kind: 'json',
    key: ({ owner, repo, endpoint }) => `${owner}/${repo}/${endpoint}`,
  },
  // One fixed key; the loader resolves '' on failure, so only real payloads are stored.
  githubAvatar: {
    kind: 'json',
    key: () => '',
    cacheWhen: (value) => typeof value === 'string' && value !== '',
  },
}

const DECLARATION_BY_ID = new Map(CACHE_DECLARATIONS.map((entry) => [entry.id, entry]))

interface ResolvedSlot {
  prefix: string
  ttlSeconds: number
}

// Null-tolerant: pre-hydration callers fall back to the declared defaults;
// tunable buckets read the live snapshot, so an admin retune applies next access.
export function resolveCacheSlot(id: CacheBucketId): ResolvedSlot {
  const declaration = DECLARATION_BY_ID.get(id)
  if (declaration === undefined) {
    throw new Error(`unknown cache bucket: ${id}`)
  }
  const fallback: ResolvedSlot = {
    prefix: declaration.defaultPrefix,
    ttlSeconds: declaration.defaultTtlSeconds,
  }
  if (!isTunableCacheBucket(id)) {
    return fallback
  }
  const slot = getBlogSettingsBundleSync()?.cache?.cache[id]
  return {
    prefix: typeof slot?.prefix === 'string' ? slot.prefix : fallback.prefix,
    ttlSeconds: typeof slot?.ttlSeconds === 'number' ? slot.ttlSeconds : fallback.ttlSeconds,
  }
}

function keyFor<K extends CacheBucketId>(id: K, params: CacheParamsMap[K]): { key: string; slot: ResolvedSlot } {
  const slot = resolveCacheSlot(id)
  return { key: `${slot.prefix}${BEHAVIORS[id].key(params)}`, slot }
}

async function readEntry(db: Database, id: CacheBucketId, key: string): Promise<unknown> {
  const behavior = BEHAVIORS[id]
  try {
    if (behavior.kind === 'binary') {
      const raw = await getItemRaw(db, key)
      if (raw === null) {
        return null
      }
      const decode = behavior.decode ?? ((blob: Buffer) => blob)
      return decode(raw)
    }
    const parsed = await getItem(db, key)
    if (parsed === null) {
      return null
    }
    if (behavior.schema !== undefined) {
      const result = behavior.schema.safeParse(parsed)
      if (!result.success) {
        // Stale shape reads as a miss and evicts the row.
        await removeItem(db, key)
        return null
      }
      return result.data
    }
    return parsed
  } catch (error) {
    log.warn('cache read failed; treating as a miss', { bucket: id, error })
    return null
  }
}

async function writeEntry(db: Database, id: CacheBucketId, key: string, slot: ResolvedSlot, value: unknown) {
  const behavior = BEHAVIORS[id]
  try {
    if (behavior.kind === 'binary') {
      // A binary declaration without a codec stores raw Buffers.
      const encode = behavior.encode ?? ((blob: unknown) => unsafeCast<Buffer>(blob))
      await setItemRaw(db, key, encode(value), { ttlSeconds: slot.ttlSeconds, bucket: id })
      return
    }
    // Payloads are JSON-native by declaration contract — the cast documents the boundary.
    await setItem(db, key, unsafeCast<JsonValue>(value), { ttlSeconds: slot.ttlSeconds, bucket: id })
  } catch (error) {
    log.warn('cache write failed; continuing without warmth', { bucket: id, error })
  }
}

// Process-wide coalescer: concurrent loads for the same key share one promise.
// Keys are namespaced by bucket id — a renamed prefix can't merge two caches.
const inflight = createInflight<unknown>()

/**
 * Cache-aside with inflight coalescing. `devBypass` caches skip the read in dev but still write.
 */
export async function through<K extends CacheBucketId, V>(
  db: Database,
  id: K,
  params: CacheParamsMap[K],
  loader: () => Promise<V>,
  options: { onHit?: (value: V) => void } = {},
): Promise<V> {
  const behavior = BEHAVIORS[id]
  const { key, slot } = keyFor(id, params)
  const bypassRead = behavior.devBypass === true && !import.meta.env.PROD
  if (!bypassRead) {
    const hit = await readEntry(db, id, key)
    if (hit !== null) {
      options.onHit?.(unsafeCast<V>(hit))
      return unsafeCast<V>(hit)
    }
  }
  return unsafeCast<Promise<V>>(
    inflight(`${id}:${key}`, async () => {
      // Double-check: a concurrent request may have warmed the row while we waited.
      if (!bypassRead) {
        const hit = await readEntry(db, id, key)
        if (hit !== null) {
          options.onHit?.(unsafeCast<V>(hit))
          return unsafeCast<V>(hit)
        }
      }
      const value = await loader()
      if (behavior.cacheWhen === undefined || behavior.cacheWhen(value)) {
        await writeEntry(db, id, key, slot, value)
      }
      return value
    }),
  )
}

/** Concurrent reads of the same key coalesce. */
export async function get<K extends CacheBucketId, V>(
  db: Database,
  id: K,
  params: CacheParamsMap[K],
): Promise<V | null> {
  const { key } = keyFor(id, params)
  return unsafeCast<Promise<V | null>>(inflight(`read:${id}:${key}`, () => readEntry(db, id, key)))
}

/** Direct write (best-effort — failures are logged and swallowed). */
export async function set<K extends CacheBucketId, V>(
  db: Database,
  id: K,
  params: CacheParamsMap[K],
  value: V,
): Promise<void> {
  const { key, slot } = keyFor(id, params)
  await writeEntry(db, id, key, slot, value)
}

/** Per-key delete (best-effort). */
export async function remove<K extends CacheBucketId>(db: Database, id: K, params: CacheParamsMap[K]): Promise<void> {
  const { key } = keyFor(id, params)
  try {
    await removeItem(db, key)
  } catch (error) {
    log.warn('cache remove failed', { bucket: id, error })
  }
}

/** Whole-bucket delete — one bucket-column DELETE, no prefix scan (best-effort). */
// Sync (node:sqlite): called inside entity transactions via `invalidateContent`.
export function clear(db: Database, id: CacheBucketId): void {
  try {
    db.delete(kvCache).where(eq(kvCache.bucket, id)).run()
  } catch (error) {
    log.warn('cache bucket clear failed', { bucket: id, error })
  }
}

/**
 * Batch cache-aside: one MGET per entry, the loader runs once for the misses.
 * Returns one entry per input, in input order (uncovered misses are null).
 */
export async function throughMany<K extends CacheBucketId, V>(
  db: Database,
  id: K,
  paramsList: CacheParamsMap[K][],
  loader: (missing: CacheParamsMap[K][]) => Promise<{ params: CacheParamsMap[K]; value: V }[]>,
): Promise<{ params: CacheParamsMap[K]; value: V | null }[]> {
  if (paramsList.length === 0) {
    return []
  }
  const behavior = BEHAVIORS[id]
  const slot = resolveCacheSlot(id)
  const keys = paramsList.map((params) => `${slot.prefix}${behavior.key(params)}`)

  let cached: { key: string; value: unknown }[]
  try {
    cached = await getItems(db, keys)
  } catch (error) {
    log.warn('cache batch read failed; treating every key as a miss', { bucket: id, error })
    cached = keys.map((key) => ({ key, value: null }))
  }

  const values: (V | null)[] = cached.map((entry) => unsafeCast<V | null>(entry.value))
  const missingIndexes: number[] = []
  cached.forEach((entry, index) => {
    if (entry.value === null) {
      missingIndexes.push(index)
    }
  })

  if (missingIndexes.length > 0) {
    const missing = missingIndexes.map((index) => paramsList[index] as CacheParamsMap[K])
    const loaded = await loader(missing)
    // Match loaded values by computed key — the loader may rebuild its params.
    const loadedByKey = new Map(loaded.map((entry) => [behavior.key(entry.params), entry.value]))
    await Promise.all(
      missingIndexes.map(async (index) => {
        const params = paramsList[index] as CacheParamsMap[K]
        const value = loadedByKey.get(behavior.key(params))
        if (value === undefined) {
          return
        }
        values[index] = value
        await writeEntry(db, id, keys[index] as string, slot, value)
      }),
    )
  }

  return paramsList.map((params, index) => ({ params, value: values[index] ?? null }))
}

// Generation is read once per process and cached; failed reads fall back to 0 and
// are NOT cached (the next search retries). Single-instance: only this process bumps.
const counterMemo = new Map<CacheBucketId, Promise<number>>()

function assertCounter(id: CacheBucketId): void {
  if (BEHAVIORS[id].counter !== true) {
    throw new Error(`cache '${id}' declares no counter`)
  }
}

function counterKey(id: CacheBucketId): string {
  return `${resolveCacheSlot(id).prefix}generation`
}

// Counter row: `${prefix}generation` key, raw integer JSON in `value`, NULL
// `expires_at` (never swept) — read via direct SQL, not kv-store.
function parseCounter(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  return Number.isNaN(parsed) ? 0 : parsed
}

function liveCounterRow() {
  return or(isNull(kvCache.expiresAt), gt(kvCache.expiresAt, new Date()))
}

export function getCounter(db: Database, id: CacheBucketId): Promise<number> {
  assertCounter(id)
  let memo = counterMemo.get(id)
  if (memo === undefined) {
    memo = Promise.resolve()
      .then(() =>
        db
          .select({ value: kvCache.value })
          .from(kvCache)
          .where(and(eq(kvCache.key, counterKey(id)), liveCounterRow()))
          .limit(1)
          .all(),
      )
      .then((rows) => parseCounter(rows[0]?.value ?? 0))
      .catch((error: unknown) => {
        counterMemo.delete(id)
        log.warn('cache counter read failed', { bucket: id, error })
        return 0
      })
    counterMemo.set(id, memo)
  }
  return memo
}

/**
 * Bump the generation, orphaning entries with older stamps. Fire-and-forget:
 * failures are logged and swallowed here. Sync — node:sqlite.
 */
export function bumpCounter(db: Database, id: CacheBucketId): void {
  assertCounter(id)
  try {
    const key = counterKey(id)
    const rows = db
      .select({ value: kvCache.value })
      .from(kvCache)
      .where(and(eq(kvCache.key, key), liveCounterRow()))
      .limit(1)
      .all()
    const generation = parseCounter(rows[0]?.value ?? 0) + 1
    db.insert(kvCache)
      .values({ key, bucket: id, value: generation, blob: null, expiresAt: null })
      .onConflictDoUpdate({ target: kvCache.key, set: { value: generation, blob: null, expiresAt: null } })
      .run()
    counterMemo.set(id, Promise.resolve(generation))
    log.info('cache counter bumped', { bucket: id, generation })
  } catch (error: unknown) {
    log.warn('cache counter bump failed', { bucket: id, error })
  }
}

/** Test-only seam: drop the process-cached counters so the next read re-reads `kv_cache`. */
export function __resetCacheCountersForTests(): void {
  counterMemo.clear()
}
