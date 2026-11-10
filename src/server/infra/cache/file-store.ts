import type { Dirent } from 'node:fs'

import { Buffer } from 'node:buffer'
import { createHash, randomBytes } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { type FileHandle, mkdir, open, readFile, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { JsonValue } from '@/shared/utils/json-value'

import { serverConfig } from '@/server/infra/config'
import { isInMemoryPath } from '@/server/infra/db/database'
import { CACHE_DECLARATIONS } from '@/shared/cache/registry'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

/**
 * Filesystem file-access plane for `@/server/infra/cache/registry` (ADR-0013).
 *
 * One entry = one file under `<storage.data>/cache/<bucket>/<h[0:2]>/<h[2:]>`,
 * where `h = sha256(fullKey)`. Bucket ids are stable (never the tunable prefix);
 * keys never reach a filename, so PII in avatar keys stays out of directory
 * listings. The envelope is `[4B "KBC1"][8B BE expiresAtMs, 0 = never][payload]`;
 * JSON payloads are UTF-8 text, binary payloads raw bytes.
 *
 * Every operation here may throw — the registry's best-effort handlers own
 * degradation (failed read = miss, failed write = skipped warmth). Only the
 * filesystem-level "absent" cases are normalised: ENOENT on read/remove is a
 * miss / no-op, and an unreadable envelope (short or bad magic) reads as a miss
 * and is evicted. Reads are lazy-TTL: expired entries are unlinked here.
 *
 * Writes go to `<bucket>/_tmp/<pid>-<random>` and are renamed into the shard,
 * so a torn payload is never visible. No fsync: a crash loses recent warmth,
 * which regenerates. A concurrent clear can remove the tree between mkdir and
 * rename; the write recreates the directories once and retries.
 *
 * `KOBATO_CACHE_DIR` (the SEA natives dir) is deliberately never consulted —
 * this cache is scoped to the instance's `storage.data`.
 */

const MAGIC = Buffer.from('KBC1', 'latin1')
const HEADER_SIZE = MAGIC.length + 8
const TMP_DIR_NAME = '_tmp'
const GENERATION_FILE = '_generation'
const BUCKET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const SHARD_DIR_PATTERN = /^[0-9a-f]{2}$/
const SWEEP_AGE_MS = 60 * 60 * 1000
const TRASH_INFIX = '.trash-'

export interface FileStoreSetOptions {
  /** Time-to-live in seconds. Ignored when `expiresAtMs` is provided. */
  ttlSeconds?: number
  /** Absolute deadline (epoch ms, `0` = never). The registry passes the deadline
   *  it also stores in L1, so both planes share one value. */
  expiresAtMs?: number
}

// Vitest runs on `:memory:` and must not share `/tmp/kobato-data` with other
// test files; one throwaway root per process/module instance.
let inMemoryRoot: string | undefined

/**
 * The cache root (`<storage.data>/cache`). In-memory test databases get a
 * per-process `mkdtemp` directory instead. This is also the seam later phases
 * use for sweeping, clearing, and restore wipes.
 */
export function resolveCacheRoot(): string {
  if (isInMemoryPath(serverConfig.storage.database)) {
    inMemoryRoot ??= mkdtempSync(path.join(tmpdir(), 'kobato-cache-'))
    return inMemoryRoot
  }
  return path.resolve(serverConfig.storage.data, 'cache')
}

function assertBucketId(bucket: string): void {
  // The id becomes a path segment; reject traversal/empty segments outright.
  if (!BUCKET_ID_PATTERN.test(bucket)) {
    throw new TypeError(`invalid cache bucket id: ${bucket}`)
  }
}

function bucketDir(bucket: string): string {
  assertBucketId(bucket)
  return path.join(resolveCacheRoot(), bucket)
}

function entryPath(bucket: string, fullKey: string): string {
  const digest = createHash('sha256').update(fullKey, 'utf8').digest('hex')
  return path.join(bucketDir(bucket), digest.slice(0, 2), digest.slice(2))
}

function isErrnoCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

// Best-effort: a concurrent clear or sweep may have already removed the file.
async function discard(file: string): Promise<void> {
  try {
    await unlink(file)
  } catch {
    // The entry is a miss either way; eviction is opportunistic.
  }
}

function expiryFrom(opts: FileStoreSetOptions): number {
  if (opts.expiresAtMs !== undefined) {
    return opts.expiresAtMs
  }
  return opts.ttlSeconds ? Math.round(Date.now() + opts.ttlSeconds * 1000) : 0
}

function encodeEnvelope(payload: Buffer, expiresAtMs: number): Buffer {
  const header = Buffer.allocUnsafe(HEADER_SIZE)
  MAGIC.copy(header, 0)
  header.writeBigUInt64BE(BigInt(expiresAtMs), MAGIC.length)
  return Buffer.concat([header, payload])
}

interface Envelope {
  payload: Buffer
  expiresAtMs: number
}

function decodeEnvelope(raw: Buffer): Envelope | null {
  if (raw.length < HEADER_SIZE || !raw.subarray(0, MAGIC.length).equals(MAGIC)) {
    return null
  }
  return { payload: raw.subarray(HEADER_SIZE), expiresAtMs: Number(raw.readBigUInt64BE(MAGIC.length)) }
}

async function readEnvelope(bucket: string, fullKey: string): Promise<Envelope | null> {
  const file = entryPath(bucket, fullKey)
  let raw: Buffer
  try {
    raw = await readFile(file)
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) {
      return null
    }
    throw error
  }
  const envelope = decodeEnvelope(raw)
  if (envelope === null) {
    await discard(file)
    return null
  }
  if (envelope.expiresAtMs !== 0 && envelope.expiresAtMs <= Date.now()) {
    await discard(file)
    return null
  }
  return envelope
}

async function writeOnce(shardDir: string, tmpDir: string, file: string, bytes: Buffer): Promise<void> {
  await mkdir(shardDir, { recursive: true })
  await mkdir(tmpDir, { recursive: true })
  const tmpFile = path.join(tmpDir, `${process.pid}-${randomBytes(6).toString('hex')}.tmp`)
  try {
    await writeFile(tmpFile, bytes)
    // Same bucket tree, same filesystem — atomic replacement, never a torn entry.
    await rename(tmpFile, file)
  } catch (error) {
    await discard(tmpFile)
    throw error
  }
}

async function writePayload(bucket: string, fullKey: string, payload: Buffer, opts: FileStoreSetOptions) {
  const file = entryPath(bucket, fullKey)
  const shardDir = path.dirname(file)
  const tmpDir = path.join(bucketDir(bucket), TMP_DIR_NAME)
  const bytes = encodeEnvelope(payload, expiryFrom(opts))
  try {
    await writeOnce(shardDir, tmpDir, file, bytes)
  } catch (error) {
    if (!isErrnoCode(error, 'ENOENT')) {
      throw error
    }
    // A concurrent clear removed the bucket tree after mkdir; recreate once.
    await writeOnce(shardDir, tmpDir, file, bytes)
  }
}

/**
 * A live payload plus the deadline it was written with (`0` = never). The
 * registry mirrors the value into its L1 memory layer under this SAME deadline,
 * so the memory copy can never outlive the file.
 */
export interface StoredEntry<T> {
  value: T
  expiresAtMs: number
}

export async function getItemWithExpiry<T>(bucket: string, fullKey: string): Promise<StoredEntry<T> | null> {
  const envelope = await readEnvelope(bucket, fullKey)
  return envelope === null
    ? null
    : { value: unsafeCast<T>(JSON.parse(envelope.payload.toString('utf8'))), expiresAtMs: envelope.expiresAtMs }
}

/**
 * JSON write. Returns the exact text it stored, so a caller that also mirrors
 * the value into a memory tier can reuse it instead of serializing twice.
 */
export async function setItem(
  bucket: string,
  fullKey: string,
  value: JsonValue,
  opts: FileStoreSetOptions = {},
): Promise<string> {
  const text = JSON.stringify(value)
  await writePayload(bucket, fullKey, Buffer.from(text, 'utf8'), opts)
  return text
}

export async function getItemRawWithExpiry(bucket: string, fullKey: string): Promise<StoredEntry<Buffer> | null> {
  const envelope = await readEnvelope(bucket, fullKey)
  return envelope === null ? null : { value: envelope.payload, expiresAtMs: envelope.expiresAtMs }
}

export async function setItemRaw(
  bucket: string,
  fullKey: string,
  value: Buffer,
  opts: FileStoreSetOptions = {},
): Promise<void> {
  await writePayload(bucket, fullKey, value, opts)
}

/** MGET with the envelope deadline, for callers that mirror the hit into L1. */
export async function getItemsWithExpiry(
  bucket: string,
  keys: readonly string[],
): Promise<{ key: string; entry: StoredEntry<unknown> | null }[]> {
  return Promise.all(keys.map(async (key) => ({ key, entry: await getItemWithExpiry<unknown>(bucket, key) })))
}

export async function removeItem(bucket: string, fullKey: string): Promise<void> {
  try {
    await unlink(entryPath(bucket, fullKey))
  } catch (error) {
    // Removing an absent entry (or one a concurrent clear already dropped) is a no-op.
    if (isErrnoCode(error, 'ENOENT')) {
      return
    }
    throw error
  }
}

// ── Generation counter (`<bucket>/_generation`) ────────────────────────────

function generationPath(bucket: string): string {
  return path.join(bucketDir(bucket), GENERATION_FILE)
}

function parseGeneration(text: string): number {
  const parsed = Number.parseInt(text.trim(), 10)
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

/** Async read (registry memoizes it). Missing/corrupt file reads as generation 0. */
export async function readGeneration(bucket: string): Promise<number> {
  try {
    return parseGeneration(await readFile(generationPath(bucket), 'utf8'))
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) {
      return 0
    }
    throw error
  }
}

/**
 * Synchronous read-modify-write bump (the invalidation verbs run inside entity
 * transactions). tmp-file + rename, no fsync: a lost bump regenerates warmth.
 */
export function bumpGeneration(bucket: string): number {
  const dir = bucketDir(bucket)
  const file = path.join(dir, GENERATION_FILE)
  mkdirSync(dir, { recursive: true })
  let current = 0
  try {
    current = parseGeneration(readFileSync(file, 'utf8'))
  } catch (error) {
    if (!isErrnoCode(error, 'ENOENT')) {
      throw error
    }
  }
  const next = current + 1
  const tmpDir = path.join(dir, TMP_DIR_NAME)
  mkdirSync(tmpDir, { recursive: true })
  const tmpFile = path.join(tmpDir, `${process.pid}-${randomBytes(6).toString('hex')}.tmp`)
  writeFileSync(tmpFile, String(next))
  try {
    renameSync(tmpFile, file)
  } catch (error) {
    try {
      unlinkSync(tmpFile)
    } catch {
      // Best-effort cleanup; the sweep reaps aged tmp files.
    }
    throw error
  }
  return next
}

// ── Sync bucket reclamation (content invalidation) ─────────────────────────

/** Two-hex-char shard directories only — `_tmp`, `_generation`, and trash dirs never qualify. */
function listShardDirsSync(bucket: string): string[] {
  const dir = bucketDir(bucket)
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) {
      return []
    }
    throw error
  }
  return entries
    .filter((entry) => entry.isDirectory() && SHARD_DIR_PATTERN.test(entry.name))
    .map((entry) => path.join(dir, entry.name))
}

/**
 * Small-bucket synchronous clear: unlink every entry file in place. Used by
 * ordinary content invalidation (single-digit file counts); large buckets go
 * through `trashBucketSync`. Returns the number of unlinked entries.
 */
export function unlinkBucketEntriesSync(bucket: string): number {
  let removed = 0
  let failure: unknown
  for (const shardDir of listShardDirsSync(bucket)) {
    let files
    try {
      files = readdirSync(shardDir, { withFileTypes: true })
    } catch (error) {
      if (isErrnoCode(error, 'ENOENT')) {
        continue
      }
      failure ??= error
      continue
    }
    for (const file of files) {
      if (!file.isFile()) {
        continue
      }
      try {
        unlinkSync(path.join(shardDir, file.name))
        removed += 1
      } catch (error) {
        if (!isErrnoCode(error, 'ENOENT')) {
          failure ??= error
        }
      }
    }
  }
  if (failure !== undefined) {
    throw failure
  }
  return removed
}

/**
 * O(1) synchronous rename-to-trash for a large bucket; the recursive delete is
 * handed to an async reap whose rejection is swallowed (the sweep reclaims a
 * leftover trash dir after an hour). A concurrent writer recreates the bucket
 * tree and lands on its own (old) key.
 */
export function trashBucketSync(bucket: string): void {
  const dir = bucketDir(bucket)
  const trash = path.join(resolveCacheRoot(), `${bucket}${TRASH_INFIX}${process.pid}-${randomBytes(6).toString('hex')}`)
  try {
    renameSync(dir, trash)
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) {
      return
    }
    throw error
  }
  // `rename` preserves the source dir's mtime; stamp the reclamation time so
  // the sweep's one-hour floor measures the trash, not the bucket's history.
  try {
    const seconds = Date.now() / 1000
    utimesSync(trash, seconds, seconds)
  } catch {
    // Advisory only — a stale mtime just reaps the trash sooner.
  }
  void rm(trash, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }).catch(() => {
    // A leftover is reaped by the hourly sweep; never surface an unhandled rejection.
  })
}

// ── Async admin / sweep operations ─────────────────────────────────────────

async function listShardDirs(bucket: string): Promise<string[]> {
  const dir = bucketDir(bucket)
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) {
      return []
    }
    throw error
  }
  return entries
    .filter((entry) => entry.isDirectory() && SHARD_DIR_PATTERN.test(entry.name))
    .map((entry) => path.join(dir, entry.name))
}

async function readHeader(file: string): Promise<Buffer> {
  const handle = await open(file, 'r')
  try {
    const header = Buffer.alloc(HEADER_SIZE)
    const { bytesRead } = await handle.read(header, 0, HEADER_SIZE, 0)
    return header.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

function isLiveHeader(header: Buffer, now: number): boolean {
  if (header.length < HEADER_SIZE || !header.subarray(0, MAGIC.length).equals(MAGIC)) {
    return false
  }
  const expiresAtMs = Number(header.readBigUInt64BE(MAGIC.length))
  return expiresAtMs === 0 || expiresAtMs > now
}

function isExpiredHeader(header: Buffer, now: number): boolean {
  if (header.length < HEADER_SIZE || !header.subarray(0, MAGIC.length).equals(MAGIC)) {
    return false
  }
  const expiresAtMs = Number(header.readBigUInt64BE(MAGIC.length))
  return expiresAtMs !== 0 && expiresAtMs <= now
}

export interface CacheBucketUsage {
  /** Entries the read path would serve: valid `KBC1` and not expired. */
  keyCount: number
  /** Bytes of every entry file in the shards (envelope included; expired/malformed still occupy disk). */
  byteSize: number
}

/**
 * Admin stats in ONE shard walk: per entry file, `stat` for the on-disk size
 * and a 12-byte header read for liveness. Expired/malformed files count toward
 * `byteSize` but not `keyCount`; `_generation`, `_tmp`, and directories are
 * outside the walk.
 */
export async function statBucket(bucket: string, now: number = Date.now()): Promise<CacheBucketUsage> {
  let keyCount = 0
  let byteSize = 0
  for (const shardDir of await listShardDirs(bucket)) {
    let files
    try {
      files = await readdir(shardDir, { withFileTypes: true })
    } catch (error) {
      if (isErrnoCode(error, 'ENOENT')) {
        continue
      }
      throw error
    }
    for (const file of files) {
      if (!file.isFile()) {
        continue
      }
      const filePath = path.join(shardDir, file.name)
      let handle: FileHandle | undefined
      try {
        handle = await open(filePath, 'r')
        const info = await handle.stat()
        byteSize += info.size
        const header = Buffer.alloc(HEADER_SIZE)
        const { bytesRead } = await handle.read(header, 0, HEADER_SIZE, 0)
        if (isLiveHeader(header.subarray(0, bytesRead), now)) {
          keyCount += 1
        }
      } catch (error) {
        if (!isErrnoCode(error, 'ENOENT')) {
          throw error
        }
      } finally {
        await handle?.close()
      }
    }
  }
  return { keyCount, byteSize }
}

/** Admin clear count: every entry file, expired and malformed included. */
export async function countEntryFiles(bucket: string): Promise<number> {
  let total = 0
  for (const shardDir of await listShardDirs(bucket)) {
    let files
    try {
      files = await readdir(shardDir, { withFileTypes: true })
    } catch (error) {
      if (isErrnoCode(error, 'ENOENT')) {
        continue
      }
      throw error
    }
    total += files.filter((file) => file.isFile()).length
  }
  return total
}

/** Admin clear: count first (the result DTO reports removals), then async rm the bucket. */
export async function clearBucketDir(bucket: string): Promise<number> {
  const removed = await countEntryFiles(bucket)
  await rm(bucketDir(bucket), { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
  return removed
}

/**
 * Admin clear for a counter bucket: delete every entry shard and `_tmp`, but
 * keep the already-bumped `_generation` file. Entries written late under an
 * older generation land in a recreated shard and stay unreachable forever.
 */
export async function clearBucketEntries(bucket: string): Promise<number> {
  const dir = bucketDir(bucket)
  const removed = await countEntryFiles(bucket)
  for (const shardDir of await listShardDirs(bucket)) {
    await rm(shardDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
  }
  await rm(path.join(dir, TMP_DIR_NAME), { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
  return removed
}

function isSkippableSweepError(error: unknown): boolean {
  return isErrnoCode(error, 'ENOENT') || isErrnoCode(error, 'EPERM') || isErrnoCode(error, 'EBUSY')
}

/**
 * Hourly filesystem leg: unlink expired entries (12-byte header read only),
 * reap `_tmp` files older than an hour, and reclaim `<bucket>.trash-*` dirs
 * older than an hour (a crash between rename and reap). Per-file races are
 * skipped; the first unexpected error aborts this bucket only.
 */
export async function sweepBucket(bucket: string, now: number = Date.now()): Promise<void> {
  const dir = bucketDir(bucket)
  let failure: unknown
  const record = (error: unknown) => {
    if (!isSkippableSweepError(error)) {
      failure ??= error
    }
  }

  let shardDirs: string[] = []
  try {
    shardDirs = await listShardDirs(bucket)
  } catch (error) {
    record(error)
  }
  for (const shardDir of shardDirs) {
    let files
    try {
      files = await readdir(shardDir, { withFileTypes: true })
    } catch (error) {
      record(error)
      continue
    }
    for (const file of files) {
      if (!file.isFile()) {
        continue
      }
      const filePath = path.join(shardDir, file.name)
      try {
        if (isExpiredHeader(await readHeader(filePath), now)) {
          await unlink(filePath)
        }
      } catch (error) {
        record(error)
      }
    }
  }

  const tmpDir = path.join(dir, TMP_DIR_NAME)
  let tmpFiles: Dirent[]
  try {
    tmpFiles = await readdir(tmpDir, { withFileTypes: true })
  } catch (error) {
    record(error)
    tmpFiles = []
  }
  for (const file of tmpFiles) {
    if (!file.isFile()) {
      continue
    }
    const filePath = path.join(tmpDir, file.name)
    try {
      const info = await stat(filePath)
      if (info.mtimeMs < now - SWEEP_AGE_MS) {
        await unlink(filePath)
      }
    } catch (error) {
      record(error)
    }
  }

  let rootEntries: Dirent[]
  try {
    rootEntries = await readdir(resolveCacheRoot(), { withFileTypes: true })
  } catch (error) {
    record(error)
    rootEntries = []
  }
  const trashPrefix = `${bucket}${TRASH_INFIX}`
  for (const entry of rootEntries) {
    if (!entry.isDirectory() || !entry.name.startsWith(trashPrefix)) {
      continue
    }
    const trashDir = path.join(resolveCacheRoot(), entry.name)
    try {
      const info = await stat(trashDir)
      if (info.mtimeMs < now - SWEEP_AGE_MS) {
        await rm(trashDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
      }
    } catch (error) {
      record(error)
    }
  }

  if (failure !== undefined) {
    throw failure
  }
}

/**
 * Remove and recreate the cache root — restore completion and test isolation.
 * Callers own the registry's generation memo (the file store never caches it).
 */
export async function wipeCache(): Promise<void> {
  const root = resolveCacheRoot()
  const rmOptions = { recursive: true, force: true, maxRetries: 5, retryDelay: 20 } as const
  try {
    // Fire-and-forget writes may create files while the walk runs; retry the
    // transient ENOTEMPTY instead of failing test isolation.
    await rm(root, rmOptions)
    await mkdir(root, { recursive: true })
    return
  } catch {
    // Fall through: a whole-root failure must not report a partial wipe as
    // success. Each declared bucket is reclaimed independently so one bad
    // directory cannot strand the rest.
  }

  const failures: unknown[] = []
  try {
    await mkdir(root, { recursive: true })
  } catch (error) {
    failures.push(error)
  }

  for (const declaration of CACHE_DECLARATIONS) {
    const bucket = path.join(root, declaration.id)
    try {
      await rm(bucket, rmOptions)
      await mkdir(bucket, { recursive: true })
    } catch (error) {
      failures.push(error)
    }
  }

  // Leave the root present even when individual buckets failed.
  try {
    await mkdir(root, { recursive: true })
  } catch (error) {
    failures.push(error)
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, 'cache wipe failed')
  }
}
