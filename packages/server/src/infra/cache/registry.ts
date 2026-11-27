import type { AppLocale } from '@kobato/i18n/locales'
import type { JsonValue } from '@kobato/server/infra/json'
import type { CacheBucketId } from '@kobato/settings/cache-bucket'
import type { ZodType } from 'zod'

import { unsafeCast } from '@kobato/base/utils/unsafe-cast'
import {
  bumpGeneration,
  getItemRawWithExpiry,
  getItemWithExpiry,
  readGeneration,
  removeItem,
  setItem,
  setItemRaw,
  trashBucketSync,
  unlinkBucketEntriesSync,
  wipeCache as wipeFileCache,
} from '@kobato/server/infra/cache/file-store'
import { createInflight } from '@kobato/server/infra/cache/inflight'
import {
  clearMemoryBucket,
  getMemoryItem,
  setMemoryItem,
  wipeMemoryCache,
} from '@kobato/server/infra/cache/memory-store'
import { getLogger } from '@kobato/server/infra/logger'
import { withSpanAsync } from '@kobato/server/infra/trace/facade'
import { recordCacheLookup } from '@kobato/server/infra/trace/metrics'
import { isTunableCacheBucket } from '@kobato/settings/cache-bucket'
import { CACHE_DECLARATIONS } from '@kobato/settings/cache-registry'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

const log = getLogger('cache')

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
  searchResult: { generation: number; parts: readonly string[] }
  feed: { scope: string; locale: AppLocale; version: string; settingsRevision: string }
  sitemap: { settingsRevision: string }
  githubRelease: { owner: string; repo: string; endpoint: string }
  githubAvatar: Record<string, never>
}

interface CacheBehavior<P> {
  kind: 'json' | 'binary'
  key: (params: P) => string
  schema?: ZodType
  encode?: (value: unknown) => Buffer
  decode?: (raw: Buffer) => unknown
  cacheWhen?: (value: unknown) => boolean
  ttlFor?: (value: unknown) => number | undefined
  devBypass?: boolean
  counter?: boolean
}

export enum AvatarStatus {
  HAVE_AVATAR = 0,
  NO_AVATAR = 1,
}

export interface AvatarEntry {
  status: AvatarStatus
  buffer: Buffer | null
}

function encodeAvatar(value: unknown): Buffer {
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
    return { status: AvatarStatus.HAVE_AVATAR, buffer: unsafeCast<Buffer>(raw.subarray(1)) }
  }
  return null
}

const BEHAVIORS: { [K in CacheBucketId]: CacheBehavior<CacheParamsMap[K]> } = {
  og: {
    kind: 'binary',
    devBypass: true,
    key: ({ slug, title, summary, cover, settingsRevision }) =>
      `${settingsRevision}:${slug}-${createHash('sha1').update(`${title}\u0001${summary}\u0001${cover}`).digest('hex').slice(0, 16)}`,
  },
  calendar: {
    kind: 'binary',
    devBypass: true,
    key: ({ date, theme, locale, version, settingsRevision }) =>
      `${locale}:${version}:${settingsRevision}:${date}${theme === 'dark' ? '-dark' : ''}`,
  },
  avatar: {
    kind: 'binary',
    key: ({ size, email }) => `${size}:${email}`,
    encode: encodeAvatar,
    decode: decodeAvatar,
  },
  searchResult: {
    kind: 'json',
    counter: true,
    key: ({ generation, parts }) => `${generation}:${createHash('sha256').update(parts.join('|')).digest('hex')}`,
    cacheWhen: (value) => Array.isArray(value) && value.length > 0,
  },
  feed: {
    kind: 'json',
    key: ({ scope, locale, version, settingsRevision }) => `${locale}:${version}:${settingsRevision}:${scope}`,
  },
  sitemap: {
    kind: 'json',
    key: ({ settingsRevision }) => settingsRevision,
  },
  githubRelease: {
    kind: 'json',
    key: ({ owner, repo, endpoint }) => `${owner}/${repo}/${endpoint}`,
  },
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
    setMemoryItem(id, key, value, { expiresAtMs, bytes: encoded.byteLength })
  }
  return value
}

async function readEntry(id: CacheBucketId, key: string): Promise<unknown> {
  const behavior = BEHAVIORS[id]
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

async function writeEntry(id: CacheBucketId, key: string, slot: ResolvedSlot, value: unknown) {
  const behavior = BEHAVIORS[id]
  try {
    const ttlSeconds = behavior.ttlFor?.(value) ?? slot.ttlSeconds
    const expiresAtMs = ttlSeconds ? Math.round(Date.now() + ttlSeconds * 1000) : 0
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

const inflight = createInflight<unknown>()

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
      coalesced = inflight.has(joinKey)
      const value = await inflight(joinKey, async () => {
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

export async function set<K extends CacheBucketId>(id: K, params: CacheParamsMap[K], value: unknown): Promise<void> {
  const { key, slot } = keyFor(id, params)
  await writeEntry(id, key, slot, value)
}

export function clear(id: CacheBucketId): void {
  clearMemoryBucket(id)
  try {
    unlinkBucketEntriesSync(id)
  } catch (error) {
    log.warn('cache bucket clear failed', { bucket: id, error })
  }
}

export function evictBucketMemory(id: CacheBucketId): void {
  clearMemoryBucket(id)
}

export function clearLocalizedOutputs(): void {
  let failure: unknown
  for (const id of ['feed', 'calendar', 'og', 'sitemap'] as const) {
    clearMemoryBucket(id)
    try {
      trashBucketSync(id)
    } catch (error) {
      failure ??= error
    }
  }
  if (failure !== undefined) {
    throw failure
  }
}

const counterMemo = new Map<CacheBucketId, Promise<number>>()

function assertCounter(id: CacheBucketId): void {
  if (BEHAVIORS[id].counter !== true) {
    throw new Error(`cache '${id}' declares no counter`)
  }
}

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

export function isCounterBucket(id: CacheBucketId): boolean {
  return BEHAVIORS[id].counter === true
}

export async function wipeCacheForRestore(): Promise<void> {
  wipeMemoryCache()
  try {
    await wipeFileCache()
  } finally {
    resetCacheCounterMemo()
  }
}

export function __resetCacheCountersForTests(): void {
  resetCacheCounterMemo()
}
