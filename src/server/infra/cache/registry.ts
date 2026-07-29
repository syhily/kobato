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
 * The behavior plane of the cache layer — the ONLY module that reads and
 * writes `kv_cache` rows (through `kv-store`, its internal row-access
 * plane). Each cache's key shape, codec, and write policy is declared
 * once in `BEHAVIORS`; callers pass domain params, never assembled keys.
 *
 * Unified best-effort error policy: read and write failures are logged
 * and degrade to a miss / a skipped write — the cache must NEVER fail
 * the request it serves. Loader errors still propagate (the loader is
 * the real work).
 */

// ─── Params ───────────────────────────────────────────────
//
// One params shape per cache id. Values stay caller-typed: `through`
// infers the value type from its loader, exactly like the retired
// per-cache helpers did.

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
}

// ─── Behaviors ────────────────────────────────────────────

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
  /** Dev mode always re-runs the loader but still writes (OG / calendar re-render loop). */
  devBypass?: boolean
  /** Declares the `${prefix}generation` counter row (search invalidation stamp). */
  counter?: boolean
}

// Single-key avatar layout (was two keys: `avatar-status-${email}` plus
// `avatar-${email}`). Byte 0 is the status sentinel — `HAVE_AVATAR` (0)
// means the payload follows, `NO_AVATAR` (1) is a negative, payload-less
// entry. The enum IS the persisted byte protocol; the codec below is its
// only reader/writer, and consumers (http resources, the comments avatar
// domain service) import the enum from here.
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
    // The hash folds every render input (title / summary / cover) into the
    // key so an edit produces a fresh entry instead of serving the stale
    // render under the same slug.
    key: ({ slug, title, summary, cover }) =>
      `${slug}-${createHash('sha1').update(`${title}\u0001${summary}\u0001${cover}`).digest('hex').slice(0, 16)}`,
  },
  calendar: {
    kind: 'binary',
    devBypass: true,
    // Dark variants get a distinct key so the two themes don't clobber
    // each other under the same prefix.
    key: ({ date, theme }) => `${date}${theme === 'dark' ? '-dark' : ''}`,
  },
  // The fetch size is part of the key: the endpoint serves the size its
  // caller asked for via `?s=` (120 by default) and the upstream is
  // queried at exactly that size — a 120px entry must never serve a
  // `?s=512` request (or vice versa).
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
    // The generation stamp is the invalidation mechanism: every key
    // carries the counter and bumping it orphans all previously cached
    // entries — they expire by TTL.
    key: ({ generation, parts }) => `${generation}:${createHash('sha256').update(parts.join('|')).digest('hex')}`,
    // Empty result lists are never cached, so a corpus that starts
    // matching later isn't shadowed by a stale empty page.
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
}

// ─── Slot resolution ──────────────────────────────────────

const DECLARATION_BY_ID = new Map(CACHE_DECLARATIONS.map((entry) => [entry.id, entry]))

interface ResolvedSlot {
  prefix: string
  ttlSeconds: number
}

// Null-tolerant on purpose: pre-hydration callers (CLI smoke checks,
// settings-free tests) fall back to the declared defaults instead of
// crashing on `requireBlogSettingsSection`. Tunable buckets read the live
// snapshot so an admin rename / retune applies to the very next access.
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

// ─── Read / write primitives ──────────────────────────────

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
        // Schema mismatch (e.g. new field added) — evict and treat as a
        // miss. Undeserializable rows already read as null inside
        // kv-store; only a shape mismatch needs the eager evict.
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
    // Bucket payloads are JSON-native by declaration contract (the one
    // former Date-bearer, imageMeta, stores `updatedAtMs` as a number) —
    // the cast documents the boundary; setItem enforces it downstream.
    await setItem(db, key, unsafeCast<JsonValue>(value), { ttlSeconds: slot.ttlSeconds, bucket: id })
  } catch (error) {
    log.warn('cache write failed; continuing without warmth', { bucket: id, error })
  }
}

// ─── Verbs ────────────────────────────────────────────────

// One process-wide coalescer for every cache: concurrent loads for the
// same key collapse into a single promise, so a cold OG image or a hot
// avatar hit by a request burst can't fan out into N parallel renders /
// fetches. Keys are namespaced by bucket id so a renamed prefix can
// never merge two caches into one inflight slot.
const inflight = createInflight<unknown>()

/**
 * THE main verb — cache-aside with inflight coalescing and a
 * double-checked read. On a miss the loader runs, its result is cached
 * (honoring the declaration's `cacheWhen`), and returned. `devBypass`
 * caches skip the read in dev but still write.
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
      // readEntry returns the declaration's decoded shape, which is the
      // loader's value type by the declaration's own contract.
      options.onHit?.(unsafeCast<V>(hit))
      return unsafeCast<V>(hit)
    }
  }
  return unsafeCast<Promise<V>>(
    inflight(`${id}:${key}`, async () => {
      // Double-check: a concurrent request may have warmed the row while
      // this one waited on the inflight map.
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

/** Direct read. Concurrent reads of the same key coalesce. */
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
// Sync (node:sqlite): called inside entity transactions via
// `invalidateContent`. No interleaving risk — the sync driver runs every
// statement to completion before anything else on the event loop moves.
export function clear(db: Database, id: CacheBucketId): void {
  try {
    db.delete(kvCache).where(eq(kvCache.bucket, id)).run()
  } catch (error) {
    log.warn('cache bucket clear failed', { bucket: id, error })
  }
}

/**
 * Batch cache-aside for json caches (the image-meta path): one MGET for
 * every params entry, the loader runs once for the misses, and each
 * loaded value is written back. Returns one entry per input params, in
 * input order (MGET semantics — misses the loader didn't cover come back
 * as null).
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

  // kv-store decodes the declaration's stored shape on a hit, null on a miss.
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
    // Match loaded values back by their computed key, not by params object
    // identity — the loader is free to rebuild its params.
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

// ─── Counters ─────────────────────────────────────────────
//
// The generation is read once per process and cached in module state. A
// failed read is NOT cached (the next search retries) and falls back to
// generation 0 — a missing or unreadable counter must never break
// search. Single-instance self-host is the documented deploy target, so
// only this process bumps the counter and the cached value stays
// authoritative.
const counterMemo = new Map<CacheBucketId, Promise<number>>()

function assertCounter(id: CacheBucketId): void {
  if (BEHAVIORS[id].counter !== true) {
    throw new Error(`cache '${id}' declares no counter`)
  }
}

function counterKey(id: CacheBucketId): string {
  return `${resolveCacheSlot(id).prefix}generation`
}

// The counter row lives in `kv_cache` at the `${prefix}generation` key
// with a raw integer JSON in `value` and NULL `expires_at` (never
// swept). It deliberately bypasses kv-store's `getItem`/`setItem` —
// this module is the only kv-store consumer and reaches the counter
// with direct SQL.
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
 * Bump the generation stamp, orphaning every entry stamped with an older
 * generation. Read-modify-write inside one statement sequence — safe
 * because the sync driver runs uninterrupted (no interleaving between
 * the read and the write). Fire-and-forget by contract: invalidation
 * must never bring down the mutation that triggered it, so database
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
