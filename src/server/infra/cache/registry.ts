import type { ZodType } from 'zod'

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

import type { AppLocale } from '@/shared/i18n/locales'
import type { CacheBucketId } from '@/shared/types/cache'
import type { JsonValue } from '@/shared/utils/json-value'

import {
  bumpGeneration,
  getItemRawWithExpiry,
  getItemWithExpiry,
  getItemsWithExpiry,
  readGeneration,
  removeItem,
  setItem,
  setItemRaw,
  trashBucketSync,
  unlinkBucketEntriesSync,
  wipeCache as wipeFileCache,
} from '@/server/infra/cache/file-store'
import { createInflight } from '@/server/infra/cache/inflight'
import {
  clearMemoryBucket,
  getMemoryItem,
  removeMemoryItem,
  setMemoryItem,
  wipeMemoryCache,
} from '@/server/infra/cache/memory-store'
import { getLogger } from '@/server/infra/logger'
import { withSpanAsync } from '@/server/infra/trace/facade'
import { recordCacheLookup } from '@/server/infra/trace/metrics'
import { CACHE_DECLARATIONS } from '@/shared/cache/registry'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { isTunableCacheBucket } from '@/shared/types/cache'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('cache')

/**
 * The cache behavior plane — the only module reading/writing cache entries:
 * an L1 (`memory-store`) in front of the on-disk plane (`file-store`). Reads
 * try L1, fall back to disk, backfill L1 under the envelope's own deadline;
 * writes mirror into L1 only after the disk write succeeds; every invalidation
 * evicts L1 synchronously before its filesystem leg. Best-effort throughout:
 * failures degrade to a miss / a skipped write — the cache must never fail the
 * request it serves; loader errors propagate.
 */

interface CacheParamsMap {
  og: { slug: string; title: string; summary: string; cover: string; settingsRevision: string }
  calendar: {
    date: string
    theme: 'light' | 'dark'
    locale: AppLocale
    version: string
    settingsRevision: string
  }
  avatar: { size: number; email: string }
  imageMeta: { storagePath: string }
  searchResult: { generation: number; parts: readonly string[] }
  feed: { scope: string; locale: AppLocale; version: string; settingsRevision: string }
  sitemap: { settingsRevision: string }
  categories: Record<string, never>
  tags: Record<string, never>
  comments: { settingsRevision: string; limit: number }
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
  /** Per-value TTL override (seconds); `undefined` falls back to the slot TTL.
   *  Lets one bucket cache failures briefly while successes ride the full TTL. */
  ttlFor?: (value: unknown) => number | undefined
  /** Dev mode re-runs the loader but still writes. */
  devBypass?: boolean
  /** Declares the bucket's `_generation` counter file. */
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
    // Hash of every render input (title/summary/cover) + settings generation:
    // a settings save must land on a fresh key, never a stale render.
    key: ({ slug, title, summary, cover, settingsRevision }) =>
      `${settingsRevision}:${slug}-${createHash('sha1').update(`${title}\u0001${summary}\u0001${cover}`).digest('hex').slice(0, 16)}`,
  },
  calendar: {
    kind: 'binary',
    devBypass: true,
    // Locale + version + settings generation: the same date renders a different
    // PNG per language, release, and settings generation. `-dark` keeps the
    // themes apart.
    key: ({ date, theme, locale, version, settingsRevision }) =>
      `${locale}:${version}:${settingsRevision}:${date}${theme === 'dark' ? '-dark' : ''}`,
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
    // Locale + version + settings generation: the feed body is localized
    // (`language` / `xml:lang`) and a release or settings save must land on a
    // new key.
    key: ({ scope, locale, version, settingsRevision }) => `${locale}:${version}:${settingsRevision}:${scope}`,
  },
  sitemap: {
    kind: 'json',
    // Every <loc> embeds the site origin: a general-settings save lands on a
    // fresh key instead of serving the previous domain until max-age expires.
    key: ({ settingsRevision }) => settingsRevision,
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
    // Comments-scope generation + the sidebar's configured count: either moves
    // the key, so a settings save can never serve the previous digest.
    key: ({ settingsRevision, limit }) => `${settingsRevision}:${limit}`,
  },
  // Key carries the full request target — a repo or endpoint change can't serve a stale hit.
  githubRelease: {
    kind: 'json',
    key: ({ owner, repo, endpoint }) => `${owner}/${repo}/${endpoint}`,
  },
  // One fixed key; the loader resolves '' on failure. Failures are cached
  // too — a GitHub outage would otherwise turn every call into a 30s-timeout
  // upstream fetch — but ride a 5-minute TTL so recovery shows quickly.
  githubAvatar: {
    kind: 'json',
    key: () => '',
    ttlFor: (value) => (value === '' ? 300 : undefined),
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

/** Decode a binary payload and mirror the decoded shape into L1 so both planes
 *  publish what a disk read would return. Codec rejection (`null`) is a miss,
 *  never an L1 entry. */
function decodeAndMirrorBinary(
  id: CacheBucketId,
  key: string,
  decode: ((raw: Buffer) => unknown) | undefined,
  encoded: Buffer,
  expiresAtMs: number,
): unknown {
  const decodeFn = decode ?? ((blob: Buffer) => blob)
  const value = decodeFn(encoded)
  if (value !== null) {
    // The encoded payload size is the honest estimate for a decoded shape whose
    // Buffer members serialize as byte arrays.
    setMemoryItem(id, key, value, { expiresAtMs, bytes: encoded.byteLength })
  }
  return value
}

async function readEntry(id: CacheBucketId, key: string): Promise<unknown> {
  const behavior = BEHAVIORS[id]
  // Miss sentinels: the disk plane answers `null`, memory `undefined` (never
  // stored) — `readEntry` normalizes both to `null`.
  const memoryHit = getMemoryItem(id, key)
  if (memoryHit !== undefined) {
    return memoryHit
  }
  try {
    if (behavior.kind === 'binary') {
      const stored = await getItemRawWithExpiry(id, key)
      if (stored === null) {
        return null
      }
      return decodeAndMirrorBinary(id, key, behavior.decode, stored.value, stored.expiresAtMs)
    }
    const stored = await getItemWithExpiry<JsonValue>(id, key)
    if (stored === null) {
      return null
    }
    // A literal `null` payload is a miss.
    const parsed = stored.value
    if (parsed === null) {
      return null
    }
    if (behavior.schema !== undefined) {
      const result = behavior.schema.safeParse(parsed)
      if (!result.success) {
        await removeItem(id, key)
        return null
      }
      setMemoryItem(id, key, result.data, { expiresAtMs: stored.expiresAtMs })
      return result.data
    }
    setMemoryItem(id, key, parsed, { expiresAtMs: stored.expiresAtMs })
    return parsed
  } catch (error) {
    log.warn('cache read failed; treating as a miss', { bucket: id, error })
    return null
  }
}

/**
 * Best-effort write: ttl resolution, codec, and filesystem failures are all
 * swallowed so `void writeEntry(...)` can never surface an unhandled rejection.
 */
async function writeEntry(id: CacheBucketId, key: string, slot: ResolvedSlot, value: unknown) {
  const behavior = BEHAVIORS[id]
  try {
    const ttlSeconds = behavior.ttlFor?.(value) ?? slot.ttlSeconds
    // ONE deadline, derived here and handed to both planes: the envelope stores
    // it verbatim, and L1 expires on the same instant.
    const expiresAtMs = ttlSeconds ? Math.round(Date.now() + ttlSeconds * 1000) : 0
    // A schema bucket only fills L1 from the validated READ path, never from the
    // loader's raw write value; no bucket declares a schema currently.
    const schemaValidated = behavior.schema !== undefined
    if (behavior.kind === 'binary') {
      const encode = behavior.encode ?? ((blob: unknown) => unsafeCast<Buffer>(blob))
      const encoded = encode(value)
      await setItemRaw(id, key, encoded, { expiresAtMs })
      if (!schemaValidated) {
        decodeAndMirrorBinary(id, key, behavior.decode, encoded, expiresAtMs)
      }
      return
    }
    // `setItem` returns the exact text it wrote. Parsing THAT keeps L1's value
    // identical to a disk read (undefined fields disappear, Dates become
    // strings, NaN becomes null) and sizes it without a second stringify.
    const text = await setItem(id, key, unsafeCast<JsonValue>(value), { expiresAtMs })
    if (!schemaValidated) {
      setMemoryItem(id, key, unsafeCast<JsonValue>(JSON.parse(text)), {
        expiresAtMs,
        bytes: Buffer.byteLength(text, 'utf8'),
      })
    }
  } catch (error) {
    log.warn('cache write failed; continuing without warmth', { bucket: id, error })
  }
}

// Process-wide coalescer: concurrent loads for the same key share one promise.
// Keys are namespaced by bucket id — a renamed prefix can't merge two caches.
const inflight = createInflight<unknown>()

/**
 * Cache-aside with inflight coalescing. `devBypass` caches skip the read in dev
 * but still write. The write is fire-and-forget: the loader's value is returned
 * without waiting for filesystem warmth (the write swallows its own errors).
 */
export async function through<K extends CacheBucketId, V>(
  id: K,
  params: CacheParamsMap[K],
  loader: () => Promise<V>,
  options: { onHit?: (value: V) => void } = {},
): Promise<V> {
  const behavior = BEHAVIORS[id]
  const { key, slot } = keyFor(id, params)
  const bypassRead = behavior.devBypass === true && !import.meta.env.PROD
  const joinKey = `${id}:${key}`
  let result: 'hit' | 'miss' = 'miss'
  let coalesced = false

  return withSpanAsync('cache.lookup', { attributes: { 'cache.bucket': id } }, async (span) => {
    try {
      if (!bypassRead) {
        const hit = await readEntry(id, key)
        if (hit !== null) {
          result = 'hit'
          options.onHit?.(unsafeCast<V>(hit))
          return unsafeCast<V>(hit)
        }
      }
      // A join shares another caller's load; the cache is still a miss for
      // this lookup (the entry was absent on this call's direct read).
      coalesced = inflight.has(joinKey)
      const value = await inflight(joinKey, async () => {
        // Double-check: a concurrent request may have warmed the entry while we waited.
        if (!bypassRead) {
          const hit = await readEntry(id, key)
          if (hit !== null) {
            result = 'hit'
            options.onHit?.(unsafeCast<V>(hit))
            return unsafeCast<V>(hit)
          }
        }
        const loaded = await loader()
        if (behavior.cacheWhen === undefined || behavior.cacheWhen(loaded)) {
          void writeEntry(id, key, slot, loaded)
        }
        return loaded
      })
      return unsafeCast<V>(value)
    } finally {
      span.setAttributes({ 'cache.result': result, 'cache.coalesced': coalesced })
      span.setStatus('ok')
      recordCacheLookup(id, result, coalesced)
    }
  })
}

/** Concurrent reads of the same key coalesce. */
export async function get<K extends CacheBucketId, V>(id: K, params: CacheParamsMap[K]): Promise<V | null> {
  const { key } = keyFor(id, params)
  const joinKey = `read:${id}:${key}`
  let result: 'hit' | 'miss' = 'miss'
  const coalesced = inflight.has(joinKey)

  return withSpanAsync('cache.lookup', { attributes: { 'cache.bucket': id } }, async (span) => {
    try {
      const value = await inflight(joinKey, () => readEntry(id, key))
      result = value === null ? 'miss' : 'hit'
      return unsafeCast<V | null>(value)
    } finally {
      span.setAttributes({ 'cache.result': result, 'cache.coalesced': coalesced })
      span.setStatus('ok')
      recordCacheLookup(id, result, coalesced)
    }
  })
}

/** Direct write (best-effort — failures are logged and swallowed). */
export async function set<K extends CacheBucketId>(id: K, params: CacheParamsMap[K], value: unknown): Promise<void> {
  const { key, slot } = keyFor(id, params)
  await writeEntry(id, key, slot, value)
}

/** Per-key delete (best-effort). */
export async function remove<K extends CacheBucketId>(id: K, params: CacheParamsMap[K]): Promise<void> {
  const { key } = keyFor(id, params)
  // Memory first: a failed unlink must not leave the value reachable through L1.
  removeMemoryItem(id, key)
  try {
    await removeItem(id, key)
  } catch (error) {
    log.warn('cache remove failed', { bucket: id, error })
  }
}

/**
 * Best-effort whole-bucket clear for ordinary content invalidation. Small
 * buckets only (feed/tags/categories/sitemap/comments): L1 drops synchronously
 * (the invalidation contract holds even if the unlink then fails), then the
 * entry files are unlinked in place.
 */
export function clear(id: CacheBucketId): void {
  clearMemoryBucket(id)
  try {
    unlinkBucketEntriesSync(id)
  } catch (error) {
    log.warn('cache bucket clear failed', { bucket: id, error })
  }
}

/**
 * L1-only synchronous eviction, for the admin clear path in `buckets.ts`: its
 * filesystem leg is async, but the memory tier must go cold before it starts.
 */
export function evictBucketMemory(id: CacheBucketId): void {
  clearMemoryBucket(id)
}

/**
 * Reclaim the storage behind the settings-derived render buckets (`feed`,
 * `calendar`, `og`, `comments`, `sitemap`) after a settings save. Strict (a
 * failure reaches the section-change warning channel); each bucket renames to
 * trash in O(1) and is deleted async. Correctness NEVER depends on this
 * delete: the snapshot-revision advance has already orphaned the old keys, and
 * an in-flight render writes its own old-revision key.
 */
export function clearLocalizedOutputs(): void {
  let failure: unknown
  for (const id of ['feed', 'calendar', 'og', 'comments', 'sitemap'] as const) {
    // L1 goes cold first — a trash failure must not keep a stale render servable.
    clearMemoryBucket(id)
    try {
      trashBucketSync(id)
    } catch (error) {
      // Attempt ALL buckets — a feed failure must not strand the calendar entries.
      failure ??= error
    }
  }
  if (failure !== undefined) {
    throw failure
  }
}

/**
 * Batch cache-aside: L1 first, then one file read per remaining key, fanned
 * out; the loader runs once for the misses. Returns one entry per input in
 * input order (uncovered misses are null); missing values are written back
 * fire-and-forget. Disk hits backfill L1 under the envelope's own deadline.
 */
export async function throughMany<K extends CacheBucketId, V>(
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

  let result: 'hit' | 'miss' = 'hit'
  return withSpanAsync('cache.lookup', { attributes: { 'cache.bucket': id } }, async (span) => {
    try {
      const values: (V | null)[] = paramsList.map(() => null)
      const missingIndexes: number[] = []
      keys.forEach((key, index) => {
        const memoryHit = getMemoryItem(id, key)
        if (memoryHit === undefined) {
          missingIndexes.push(index)
        } else {
          values[index] = unsafeCast<V | null>(memoryHit)
        }
      })

      if (missingIndexes.length > 0) {
        const diskKeys = missingIndexes.map((index) => keys[index] as string)
        let cached: Awaited<ReturnType<typeof getItemsWithExpiry>>
        try {
          cached = await getItemsWithExpiry(id, diskKeys)
        } catch (error) {
          log.warn('cache batch read failed; treating every key as a miss', { bucket: id, error })
          cached = diskKeys.map((key) => ({ key, entry: null }))
        }

        const stillMissing: number[] = []
        cached.forEach((entry, position) => {
          const index = missingIndexes[position] as number
          // `entry === null` is the file-store miss; `entry.value === null` is a
          // literal `null` payload, which `readEntry` also treats as a miss.
          if (entry.entry === null || entry.entry.value === null) {
            stillMissing.push(index)
            return
          }
          values[index] = unsafeCast<V | null>(entry.entry.value)
          setMemoryItem(id, entry.key, entry.entry.value, { expiresAtMs: entry.entry.expiresAtMs })
        })

        if (stillMissing.length > 0) {
          result = 'miss'
          const missing = stillMissing.map((index) => paramsList[index] as CacheParamsMap[K])
          const loaded = await loader(missing)
          // Match loaded values by computed key — the loader may rebuild its params.
          const loadedByKey = new Map(loaded.map((entry) => [behavior.key(entry.params), entry.value]))
          for (const index of stillMissing) {
            const params = paramsList[index] as CacheParamsMap[K]
            const value = loadedByKey.get(behavior.key(params))
            if (value === undefined) {
              continue
            }
            values[index] = value
            void writeEntry(id, keys[index] as string, slot, value)
          }
        }
      }

      return paramsList.map((params, index) => ({ params, value: values[index] ?? null }))
    } finally {
      span.setAttributes({ 'cache.result': result, 'cache.coalesced': false })
      span.setStatus('ok')
      recordCacheLookup(id, result, false)
    }
  })
}

// Generation is read once per process and cached; failed reads fall back to 0 and
// are NOT cached (the next search retries). Single-instance: only this process bumps.
const counterMemo = new Map<CacheBucketId, Promise<number>>()

function assertCounter(id: CacheBucketId): void {
  if (BEHAVIORS[id].counter !== true) {
    throw new Error(`cache '${id}' declares no counter`)
  }
}

/** Drop every memoized generation so the next counter read re-reads `_generation`. */
export function resetCacheCounterMemo(): void {
  counterMemo.clear()
}

export function getCounter(id: CacheBucketId): Promise<number> {
  assertCounter(id)
  let memo = counterMemo.get(id)
  if (memo === undefined) {
    memo = readGeneration(id).catch((error: unknown) => {
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
 * failures are logged and swallowed here. Sync — a tmp-file + rename, no fsync.
 * Returns the new generation, or `null` on failure so a strict caller (admin
 * clear) can abort instead of continuing on a stale generation.
 */
export function bumpCounter(id: CacheBucketId): number | null {
  assertCounter(id)
  try {
    const generation = bumpGeneration(id)
    counterMemo.set(id, Promise.resolve(generation))
    log.info('cache counter bumped', { bucket: id, generation })
    return generation
  } catch (error: unknown) {
    log.warn('cache counter bump failed', { bucket: id, error })
    return null
  }
}

/** Whether the bucket owns a `_generation` counter (only `searchResult`). */
export function isCounterBucket(id: CacheBucketId): boolean {
  return BEHAVIORS[id].counter === true
}

/**
 * Restore-completion wipe: clear the cache tree and both process-local planes.
 * L1 is dropped FIRST — even a partial file wipe must never leave pre-restore
 * values servable — and the generation memo is dropped in a `finally` so the
 * next counter read re-reads the file. A partial wipe can leave pre-restore
 * entries on disk reachable until their TTL; the caller's warning path owns
 * that residual window.
 */
export async function wipeCacheForRestore(): Promise<void> {
  wipeMemoryCache()
  try {
    await wipeFileCache()
  } finally {
    resetCacheCounterMemo()
  }
}

/** Test-only seam: drop the process-cached counters so the next read re-reads `_generation`. */
export function __resetCacheCountersForTests(): void {
  resetCacheCounterMemo()
}
