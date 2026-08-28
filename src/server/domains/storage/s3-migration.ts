import { eq } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { StorageBackend } from '@/server/infra/storage/backend'
import type { AssetsSettings, StorageDriver } from '@/shared/config/types'

import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { decryptIfNeeded, encryptIfNeeded } from '@/server/infra/crypto/secret-encryption'
import { backup as backupTable } from '@/server/infra/db/schema/backup'
import { font as fontTable } from '@/server/infra/db/schema/font'
import { image, music } from '@/server/infra/db/schema/media'
import { storageMigration } from '@/server/infra/db/schema/storage-migration'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import {
  createS3BackendFromConfig,
  validateS3Config,
  type S3ValidationResult,
} from '@/server/infra/storage/backends/s3'
import { contentTypeForKey, visibilityForKey } from '@/server/infra/storage/key-policy'
import { backendFor } from '@/server/infra/storage/registry'
import { requireBlogSettingsSection } from '@/shared/config/getters'
import {
  isStorageMigrationInFlightPhase,
  storageMigrationVerificationDto,
  type StorageMigrationDirection,
  type StorageMigrationInFlightPhase,
  type StorageMigrationPersistedPhase,
  type StorageMigrationPhase,
  type StorageMigrationStatus,
  type StorageMigrationVerification,
} from '@/shared/contracts/storage'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

/**
 * Storage migration task — copies every object from the current primary
 * backend to a target (new S3 bucket / another provider / local fallback),
 * THEN flips the config and per-asset driver columns. Three directions:
 * `local-to-s3` (first enable), `s3-to-s3` (bucket/provider change),
 * `s3-to-local` (back to local).
 *
 * State lives in the single-row `storage_migration` table (cursor +
 * counters) so a failed/cancelled/interrupted run resumes from the last
 * completed batch; the in-memory `running` slot only holds the cancel flag
 * and the single-flight guarantee. Source objects are never deleted. A
 * completed run records a final source/target consistency verification
 * (counts + bytes) on the row.
 *
 * `skippedObjects` counts objects already present on the target during the
 * INITIAL copy phase only; post-switch catch-up rounds never re-count
 * converged objects.
 *
 * Cross-domain collaborators (settings flip, branding drivers, image-meta
 * cache, content backfill) are injected through {@link wireS3Migration} at
 * the composition root — Platform domains are leaves of the domain DAG and
 * must not statically import Core/Feature domains.
 */

const log = getLogger('storage.migration.task')

const SINGLETON_ID = 1

/** Objects copied per listing batch; the cursor advances once per fully-copied batch. */
const LIST_BATCH_SIZE = 200
/** Parallel object copies inside a batch. */
const COPY_CONCURRENCY = 4
/** Per-object copy attempts before the run fails. */
const COPY_ATTEMPTS = 3
/** Mid-batch counter persistence interval (ms); batch boundaries always persist. */
const PROGRESS_FLUSH_MS = 2_000
/** Post-switch catch-up rounds; a round with zero new copies converges early. */
const CATCH_UP_ROUNDS = 3

export type S3TargetConfig = AssetsSettings['storage']

export type StartMigrationInput = { target: 'local' } | { target: 's3'; config: S3TargetConfig }

const IDLE_STATUS: StorageMigrationStatus = {
  phase: 'idle',
  direction: null,
  target: null,
  copiedObjects: 0,
  copiedBytes: 0,
  skippedObjects: 0,
  error: null,
  verification: null,
  startedAt: null,
  updatedAt: null,
  finishedAt: null,
}

class MigrationCancelled extends Error {
  constructor() {
    super('迁移已取消')
    this.name = 'MigrationCancelled'
  }
}

/** The running task's in-memory handle: cancel flag + completion promise. */
interface RunningHandle {
  cancelRequested: boolean
  promise: Promise<void>
}

let running: RunningHandle | null = null

/** Target S3 backend factory — the test seam substitutes a fake backend. */
let targetS3BackendFactory: (storage: S3TargetConfig) => StorageBackend = createS3BackendFromConfig

/**
 * Source S3 backend factory — bound ONCE to the pre-flip config snapshot so
 * catch-up / verification keep reading the OLD bucket after the settings flip
 * (the settings-driven singleton would re-resolve the NEW bucket).
 */
let sourceS3BackendFactory: (storage: S3TargetConfig) => StorageBackend = createS3BackendFromConfig

/** Target connectivity probe — the test seam stubs it (real probing hits the network). */
let targetValidator: (storage: S3TargetConfig) => Promise<S3ValidationResult> = validateS3Config

/** Test seam: substitute the target S3 backend factory and/or validator. Pair with `__resetS3MigrationForTests`. */
export function __setS3MigrationTargetFactoryForTests(
  factory: (storage: S3TargetConfig) => StorageBackend,
  validator?: (storage: S3TargetConfig) => Promise<S3ValidationResult>,
): void {
  targetS3BackendFactory = factory
  targetValidator = validator ?? (() => Promise.resolve({ ok: true }))
}

/** Test seam: substitute the source S3 backend factory (receives the pre-flip config snapshot). */
export function __setS3MigrationSourceFactoryForTests(factory: (storage: S3TargetConfig) => StorageBackend): void {
  sourceS3BackendFactory = factory
}

/** Test seam: drop the in-memory handle and restore the real factories. */
export function __resetS3MigrationForTests(): void {
  running = null
  targetS3BackendFactory = createS3BackendFromConfig
  sourceS3BackendFactory = createS3BackendFromConfig
  targetValidator = validateS3Config
  hooks = null
}

/** Test seam: await the running task's completion (fire-and-forget otherwise). */
export async function __awaitStorageMigrationForTests(): Promise<void> {
  await running?.promise
}

/**
 * Cross-domain collaborators, wired by the composition root (`bootstrap/`).
 * Structurally typed — even `import type` from Core/Feature domains is
 * banned inside this Platform leaf (boundaries contract).
 */
export interface S3MigrationHooks {
  /**
   * Persist the flipped `assets.storage` config through the settings core's
   * LOCKED-section override. Receives the COMPLETE new storage config; the
   * implementation carries over the section's non-storage fields.
   */
  readonly persistFlippedStorage: (db: Database, storage: AssetsSettings['storage']) => Promise<void>
  /** Re-point the assets settings row's branding-slot refs after a driver flip. */
  readonly flipBrandingDrivers: (db: Database, from: StorageDriver, to: StorageDriver) => Promise<void>
  /** Invalidate flipped image rows' imageMeta cache entries (the cache carries the driver). */
  readonly invalidateImageMeta: (db: Database, storagePaths: string[]) => Promise<void>
  /**
   * Completed-run content rewrite (asset-url backfill). ALWAYS runs on
   * completion — idempotent, so a failed earlier attempt is retried at every
   * completed migration regardless of the boot-time one-shot flag.
   */
  readonly postSwitchBackfill: (db: Database) => Promise<unknown>
}

let hooks: S3MigrationHooks | null = null

/** Composition-root seam: wire the cross-domain collaborators before the first run. */
export function wireS3Migration(wired: S3MigrationHooks): void {
  hooks = wired
}

function requireHooks(): S3MigrationHooks {
  if (hooks === null) {
    throw new Error('storage migration ran before wireS3Migration')
  }
  return hooks
}

/**
 * Lock probe for the settings pipeline, injected at the HTTP perimeter
 * (`updateBlogSettingsSection`'s options) — a migration owns the storage
 * config while its row is in flight or its task holds the in-memory slot.
 */
export async function isStorageMigrationActive(db: Database): Promise<boolean> {
  if (running !== null) {
    return true
  }
  const row = await readRow(db)
  return row !== null && isStorageMigrationInFlightPhase(row.phase)
}

type MigrationRow = typeof storageMigration.$inferSelect

async function readRow(db: Database): Promise<MigrationRow | null> {
  const rows = await db.select().from(storageMigration).where(eq(storageMigration.id, SINGLETON_ID))
  return rows[0] ?? null
}

function rowToStatus(row: MigrationRow | null): StorageMigrationStatus {
  if (row === null) {
    return IDLE_STATUS
  }
  // A corrupt JSON blob must not crash status reads — report no readable target.
  const targetConfig = parseStorageConfig(row.targetStorage)
  const target =
    targetConfig !== null && typeof targetConfig.bucket === 'string' && typeof targetConfig.endpoint === 'string'
      ? { bucket: targetConfig.bucket, endpoint: targetConfig.endpoint }
      : null
  // A row claiming an in-flight phase without an in-memory task means the
  // process died mid-run — report it as resumable `interrupted`.
  const phase: StorageMigrationPhase =
    isStorageMigrationInFlightPhase(row.phase) && running === null ? 'interrupted' : row.phase
  return {
    phase,
    direction: row.direction,
    target,
    copiedObjects: row.copiedObjects,
    copiedBytes: row.copiedBytes,
    skippedObjects: row.skippedObjects,
    error: row.error,
    verification: readVerification(row),
    startedAt: row.startedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  }
}

function parseStorageConfig(json: string | null): S3TargetConfig | null {
  if (json === null) {
    return null
  }
  try {
    return unsafeCast<S3TargetConfig>(JSON.parse(json))
  } catch {
    return null
  }
}

function readVerification(row: MigrationRow): StorageMigrationVerification | null {
  if (row.verification === null) {
    return null
  }
  try {
    const parsed = storageMigrationVerificationDto.safeParse(JSON.parse(row.verification))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export async function getStorageMigrationStatus(db: Database): Promise<StorageMigrationStatus> {
  return rowToStatus(await readRow(db))
}

/** Persisted config JSON → live config (decrypts the secret; corrupt JSON → null). */
function readRowConfig(json: string | null): S3TargetConfig | null {
  const parsed = parseStorageConfig(json)
  if (parsed !== null && typeof parsed.secretAccessKey === 'string' && parsed.secretAccessKey !== '') {
    parsed.secretAccessKey = decryptIfNeeded(parsed.secretAccessKey)
  }
  return parsed
}

function readTargetConfig(row: MigrationRow): S3TargetConfig | null {
  return readRowConfig(row.targetStorage)
}

function readSourceConfig(row: MigrationRow): S3TargetConfig | null {
  return readRowConfig(row.sourceStorage)
}

/** Live config → persisted JSON (encrypts the secret at rest). */
function serializeStorageConfig(config: S3TargetConfig): string {
  return JSON.stringify({ ...config, secretAccessKey: encryptIfNeeded(config.secretAccessKey ?? '') })
}

/**
 * Start a migration. Validates the target (S3 targets get a live connectivity
 * probe), enforces single-flight (in-memory slot + persisted in-flight row),
 * then runs the copy in the background — poll `getStorageMigrationStatus`.
 *
 * The in-memory slot is claimed SYNCHRONOUSLY (before the first await) and
 * released if validation fails — two concurrent starts cannot both pass.
 */
export async function startStorageMigration(db: Database, input: StartMigrationInput): Promise<StorageMigrationStatus> {
  if (running !== null) {
    throw new DomainError('CONFLICT', '已有存储迁移任务正在进行中')
  }
  const handle: RunningHandle = { cancelRequested: false, promise: Promise.resolve() }
  running = handle

  let direction: StorageMigrationDirection
  let targetConfig: S3TargetConfig | null = null
  let sourceConfig: S3TargetConfig | null = null
  try {
    const existing = await readRow(db)
    if (existing !== null && isStorageMigrationInFlightPhase(existing.phase)) {
      throw new DomainError('CONFLICT', '存在未完成的存储迁移，请从断点继续或取消后再发起')
    }

    const currentStorage = requireBlogSettingsSection('assets').storage
    const s3Active = currentStorage.enabled
    // Pre-flip source snapshot: the source backend must keep reading the OLD
    // bucket after `switchStorage` flips the live config (catch-up + verification).
    sourceConfig = s3Active ? { ...currentStorage } : null

    if (input.target === 'local') {
      if (!s3Active) {
        throw new DomainError('BAD_REQUEST', '当前未启用 S3 存储，无需迁移回本地')
      }
      direction = 's3-to-local'
    } else {
      const candidate: S3TargetConfig = { ...input.config, enabled: true }
      if (s3Active) {
        direction = 's3-to-s3'
        if (sameS3Target(currentStorage, candidate)) {
          throw new DomainError('BAD_REQUEST', '目标 S3 配置与当前配置相同，无需迁移')
        }
      } else {
        direction = 'local-to-s3'
      }
      const validation = await targetValidator(candidate)
      if (!validation.ok) {
        throw new DomainError('BAD_REQUEST', validation.message)
      }
      targetConfig = candidate
    }

    const now = new Date()
    const row = {
      direction,
      targetStorage: targetConfig === null ? null : serializeStorageConfig(targetConfig),
      sourceStorage: sourceConfig === null ? null : serializeStorageConfig(sourceConfig),
      phase: 'copying' as StorageMigrationPersistedPhase,
      cursor: null,
      copiedObjects: 0,
      copiedBytes: 0,
      skippedObjects: 0,
      error: null,
      verification: null,
      startedAt: now,
      updatedAt: now,
      finishedAt: null,
    }
    await db
      .insert(storageMigration)
      .values({ id: SINGLETON_ID, ...row })
      .onConflictDoUpdate({ target: storageMigration.id, set: row })
  } catch (error) {
    if (running === handle) {
      running = null
    }
    throw error
  }

  launch(db, direction, sourceConfig, targetConfig, null, handle)
  return rowToStatus(await readRow(db))
}

/** Cooperative cancel: the copy loop checks the flag between objects. */
export async function cancelStorageMigration(db: Database): Promise<StorageMigrationStatus> {
  const row = await readRow(db)
  if (row === null || !isStorageMigrationInFlightPhase(row.phase)) {
    throw new DomainError('BAD_REQUEST', '没有进行中的存储迁移')
  }
  if (running !== null) {
    running.cancelRequested = true
  } else {
    // Interrupted run (process died) — cancel the stale row directly.
    await db
      .update(storageMigration)
      .set({ phase: 'cancelled', error: null, updatedAt: new Date(), finishedAt: new Date() })
      .where(eq(storageMigration.id, SINGLETON_ID))
  }
  return rowToStatus(await readRow(db))
}

/**
 * Resume a failed / cancelled / interrupted run from its persisted cursor.
 * Already-copied objects are skipped by the target-side existence check.
 * Claims the in-memory slot synchronously, same as `startStorageMigration`.
 */
export async function resumeStorageMigration(db: Database): Promise<StorageMigrationStatus> {
  if (running !== null) {
    throw new DomainError('CONFLICT', '已有存储迁移任务正在进行中')
  }
  const handle: RunningHandle = { cancelRequested: false, promise: Promise.resolve() }
  running = handle

  let row: MigrationRow
  try {
    const existing = await readRow(db)
    if (existing === null) {
      throw new DomainError('BAD_REQUEST', '没有可继续的存储迁移')
    }
    const resumable =
      existing.phase === 'failed' || existing.phase === 'cancelled' || isStorageMigrationInFlightPhase(existing.phase)
    if (!resumable) {
      throw new DomainError('BAD_REQUEST', '当前迁移已完成，无需继续')
    }
    row = existing

    await db
      .update(storageMigration)
      .set({ phase: 'copying', error: null, updatedAt: new Date(), finishedAt: null })
      .where(eq(storageMigration.id, SINGLETON_ID))
  } catch (error) {
    if (running === handle) {
      running = null
    }
    throw error
  }

  const sourceConfig =
    readSourceConfig(row) ??
    // Rows written before source snapshots existed: fall back to live settings
    // (still the old config when the run never reached the flip).
    (row.direction === 'local-to-s3' ? null : requireBlogSettingsSection('assets').storage)
  launch(db, row.direction, sourceConfig, readTargetConfig(row), row.cursor, handle)
  return rowToStatus(await readRow(db))
}

function sameS3Target(a: S3TargetConfig, b: S3TargetConfig): boolean {
  return (
    a.endpoint === b.endpoint &&
    a.region === b.region &&
    a.bucket === b.bucket &&
    a.accessKeyId === b.accessKeyId &&
    a.forcePathStyle === b.forcePathStyle
  )
}

function launch(
  db: Database,
  direction: StorageMigrationDirection,
  sourceConfig: S3TargetConfig | null,
  targetConfig: S3TargetConfig | null,
  cursor: string | null,
  handle: RunningHandle,
): void {
  handle.promise = runMigration(db, direction, sourceConfig, targetConfig, cursor, handle)
    .catch((error) => {
      // The run body records failures itself; this is the crash-only backstop.
      log.error('Storage migration crashed', { error: String(error) })
    })
    .finally(() => {
      if (running === handle) {
        running = null
      }
    })
}

/**
 * Backends resolved once per run. Non-nullness follows from the direction
 * enum instead of non-null assertions: local-to-s3 has no S3 source snapshot,
 * s3-to-local has no target config.
 */
type ResolvedEndpoints =
  | {
      readonly direction: 'local-to-s3'
      readonly source: StorageBackend
      readonly target: StorageBackend
      readonly targetConfig: S3TargetConfig
    }
  | {
      readonly direction: 's3-to-s3'
      readonly source: StorageBackend
      readonly target: StorageBackend
      readonly targetConfig: S3TargetConfig
    }
  | { readonly direction: 's3-to-local'; readonly source: StorageBackend; readonly target: StorageBackend }

/** A persisted direction that demands a snapshot the row cannot supply is a corrupt row → fail the run cleanly. */
function requireSnapshot(config: S3TargetConfig | null, side: '源' | '目标'): S3TargetConfig {
  if (config === null) {
    throw new DomainError('INTERNAL', `迁移行缺少${side}配置快照，无法继续`)
  }
  return config
}

function resolveEndpoints(
  direction: StorageMigrationDirection,
  sourceConfig: S3TargetConfig | null,
  targetConfig: S3TargetConfig | null,
): ResolvedEndpoints {
  // S3 sources are bound ONCE to the pre-flip snapshot — the settings-driven
  // singleton would re-resolve the NEW bucket after the flip, stranding
  // objects written to the old bucket during the copy/switch window.
  const source =
    direction === 'local-to-s3' ? backendFor('local') : sourceS3BackendFactory(requireSnapshot(sourceConfig, '源'))
  const target =
    direction === 's3-to-local' ? backendFor('local') : targetS3BackendFactory(requireSnapshot(targetConfig, '目标'))
  return direction === 's3-to-local'
    ? { direction, source, target }
    : { direction, source, target, targetConfig: requireSnapshot(targetConfig, '目标') }
}

async function runMigration(
  db: Database,
  direction: StorageMigrationDirection,
  sourceConfig: S3TargetConfig | null,
  targetConfig: S3TargetConfig | null,
  resumeCursor: string | null,
  handle: RunningHandle,
): Promise<void> {
  const counters = { copiedObjects: 0, copiedBytes: 0, skippedObjects: 0 }
  // The live checkpoint — copyAll advances it per completed batch so the
  // failure path persists the CURRENT cursor, not the original resume point.
  const progress = { cursor: resumeCursor }
  if (resumeCursor !== null) {
    const existing = await readRow(db)
    if (existing !== null) {
      counters.copiedObjects = existing.copiedObjects
      counters.copiedBytes = existing.copiedBytes
      counters.skippedObjects = existing.skippedObjects
    }
  }

  try {
    const endpoints = resolveEndpoints(direction, sourceConfig, targetConfig)

    await copyAll(db, endpoints.source, endpoints.target, progress, counters, handle)
    throwIfCancelled(handle)

    await persistPhase(db, 'switching')
    throwIfCancelled(handle)
    await switchStorage(db, endpoints)

    await persistPhase(db, 'catching-up')
    await catchUp(db, endpoints.source, endpoints.target, counters, handle)
    throwIfCancelled(handle)

    const verification = await verifyConsistency(endpoints.source, endpoints.target)
    await db
      .update(storageMigration)
      .set({
        phase: 'completed',
        verification: JSON.stringify(verification),
        updatedAt: new Date(),
        finishedAt: new Date(),
      })
      .where(eq(storageMigration.id, SINGLETON_ID))
    log.info('Storage migration completed', { direction, ...counters, verified: verification.matches })
    recordAuditEvent({
      action: 'storage_migration_completed',
      resourceType: 'storage',
      resourceId: direction,
      details: { ...counters, verified: verification.matches },
    })
    // Content baked under the previous CDN base re-points to the site-owned
    // `/storage/<key>` form at switch time. Idempotent and ALWAYS run on
    // completion — independent of the boot-time one-shot flag, so a failed
    // earlier attempt is retried at every completed migration. Never fails
    // the run.
    try {
      const backfill = await requireHooks().postSwitchBackfill(db)
      log.info('Post-migration asset URL backfill finished', { result: backfill })
    } catch (error) {
      log.warn('Post-migration asset URL backfill failed', { error: String(error) })
    }
  } catch (error) {
    const cancelled = error instanceof MigrationCancelled
    const message = error instanceof Error ? error.message : String(error)
    await persistCounters(db, counters, progress.cursor)
    await db
      .update(storageMigration)
      .set({
        phase: cancelled ? 'cancelled' : 'failed',
        error: cancelled ? null : message,
        updatedAt: new Date(),
        finishedAt: new Date(),
      })
      .where(eq(storageMigration.id, SINGLETON_ID))
    log.warn('Storage migration ended', { direction, phase: cancelled ? 'cancelled' : 'failed', error: message })
    recordAuditEvent({
      action: cancelled ? 'storage_migration_cancelled' : 'storage_migration_failed',
      resourceType: 'storage',
      resourceId: direction,
      details: cancelled ? { ...counters } : { ...counters, error: message },
    })
  }
}

/**
 * Read-only final check: list BOTH sides and compare object counts and total
 * bytes. The target may hold pre-existing extras, so it passes when it covers
 * the source (>= on both axes), not on exact equality.
 */
async function verifyConsistency(
  source: StorageBackend,
  target: StorageBackend,
): Promise<StorageMigrationVerification> {
  const [sourceObjects, targetObjects] = await Promise.all([
    source.list('', { maxKeys: Number.MAX_SAFE_INTEGER }),
    target.list('', { maxKeys: Number.MAX_SAFE_INTEGER }),
  ])
  const sourceBytes = sourceObjects.reduce((sum, object) => sum + object.size, 0)
  const targetBytes = targetObjects.reduce((sum, object) => sum + object.size, 0)
  return {
    sourceCount: sourceObjects.length,
    sourceBytes,
    targetCount: targetObjects.length,
    targetBytes,
    matches: targetObjects.length >= sourceObjects.length && targetBytes >= sourceBytes,
    checkedAt: new Date().toISOString(),
  }
}

/**
 * Copy every source object to the target in key order. The cursor advances
 * once per fully-copied batch (a failed batch re-lists on resume; per-object
 * existence checks keep the retry idempotent).
 */
async function copyAll(
  db: Database,
  source: StorageBackend,
  target: StorageBackend,
  progress: { cursor: string | null },
  counters: { copiedObjects: number; copiedBytes: number; skippedObjects: number },
  handle: RunningHandle,
): Promise<void> {
  let lastFlush = Date.now()
  // Throttled mid-batch progress persistence so the UI sees movement on large buckets.
  const onProgress = async (): Promise<void> => {
    if (Date.now() - lastFlush >= PROGRESS_FLUSH_MS) {
      lastFlush = Date.now()
      await persistCounters(db, counters, progress.cursor)
    }
  }
  for (;;) {
    throwIfCancelled(handle)
    const batch = await source.list('', { maxKeys: LIST_BATCH_SIZE, startAfter: progress.cursor ?? undefined })
    if (batch.length === 0) {
      break
    }
    await copyBatch(source, target, batch, counters, handle, onProgress, true)
    progress.cursor = batch[batch.length - 1]!.key
    lastFlush = Date.now()
    await persistCounters(db, counters, progress.cursor)
  }
}

async function copyBatch(
  source: StorageBackend,
  target: StorageBackend,
  batch: { key: string; size: number }[],
  counters: { copiedObjects: number; copiedBytes: number; skippedObjects: number },
  handle: RunningHandle,
  onProgress: () => Promise<void>,
  countSkips: boolean,
): Promise<void> {
  let next = 0
  // Shared abort: once a copy exhausts its retries (or a cancel lands),
  // sibling workers stop picking up new keys instead of running on in the
  // background past the failure.
  let aborted = false
  const worker = async (): Promise<void> => {
    while (!aborted && next < batch.length) {
      throwIfCancelled(handle)
      const object = batch[next]!
      next += 1
      try {
        await copyOne(source, target, object, counters, countSkips)
      } catch (error) {
        aborted = true
        throw error
      }
      await onProgress()
    }
  }
  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(COPY_CONCURRENCY, batch.length); i += 1) {
    workers.push(worker())
  }
  // allSettled waits for in-flight copies to finish before propagating the
  // failure, so no stray worker outlives the run's slot release.
  const results = await Promise.allSettled(workers)
  const failure = results.find((result) => result.status === 'rejected')
  if (failure !== undefined) {
    throw failure.reason
  }
}

async function copyOne(
  source: StorageBackend,
  target: StorageBackend,
  object: { key: string; size: number },
  counters: { copiedObjects: number; copiedBytes: number; skippedObjects: number },
  countSkips: boolean,
): Promise<void> {
  if (await target.exists(object.key)) {
    // Only the initial copy phase counts skips — catch-up rounds re-observe
    // the same converged objects every round and would otherwise inflate
    // the reported number.
    if (countSkips) {
      counters.skippedObjects += 1
    }
    return
  }
  let lastError: unknown
  for (let attempt = 1; attempt <= COPY_ATTEMPTS; attempt += 1) {
    try {
      const meta = source.getStreamWithMeta
        ? await source.getStreamWithMeta(object.key)
        : { body: await source.getStream(object.key) }
      await target.putStream({
        key: object.key,
        body: meta.body,
        // Stored headers copy verbatim when the source reports them (S3);
        // otherwise the target derives Cache-Control from the key's
        // visibility class (`key-policy`) and the type from the extension.
        contentType: meta.contentType ?? contentTypeForKey(object.key),
        cacheControl: meta.cacheControl,
        visibility: visibilityForKey(object.key),
      })
      counters.copiedObjects += 1
      counters.copiedBytes += object.size
      return
    } catch (error) {
      lastError = error
      if (attempt < COPY_ATTEMPTS) {
        await sleep(300 * attempt)
      }
    }
  }
  throw new DomainError(
    'INTERNAL',
    `复制对象失败（已重试 ${COPY_ATTEMPTS} 次）: ${object.key} — ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
}

/** Post-switch catch-up: copy whatever landed on the source during the flip. */
async function catchUp(
  db: Database,
  source: StorageBackend,
  target: StorageBackend,
  counters: { copiedObjects: number; copiedBytes: number; skippedObjects: number },
  handle: RunningHandle,
): Promise<void> {
  for (let round = 0; round < CATCH_UP_ROUNDS; round += 1) {
    throwIfCancelled(handle)
    const before = counters.copiedObjects
    let cursor: string | null = null
    for (;;) {
      const batch = await source.list('', { maxKeys: LIST_BATCH_SIZE, startAfter: cursor ?? undefined })
      if (batch.length === 0) {
        break
      }
      await copyBatch(source, target, batch, counters, handle, () => Promise.resolve(), false)
      cursor = batch[batch.length - 1]!.key
    }
    if (counters.copiedObjects === before) {
      break
    }
    await persistCounters(db, counters, null)
  }
}

/**
 * The flip: persist the new storage config through the wired settings-core
 * override, then re-point every per-asset driver column and the branding
 * refs. Only runs after the copy finished with zero failures.
 */
async function switchStorage(db: Database, endpoints: ResolvedEndpoints): Promise<void> {
  if (endpoints.direction === 's3-to-local') {
    // Carry over asset/upload — the assets section ships no defaults, so a
    // storage-only patch cannot validate without a stored row.
    const current = requireBlogSettingsSection('assets')
    await requireHooks().persistFlippedStorage(db, { ...current.storage, enabled: false })
    await flipDriverColumns(db, endpoints, 's3', 'local')
    await requireHooks().flipBrandingDrivers(db, 's3', 'local')
    return
  }

  const target = endpoints.targetConfig
  await requireHooks().persistFlippedStorage(db, target)
  if (endpoints.direction === 'local-to-s3') {
    // s3-to-s3 keeps the same keys — only the bucket in settings changed.
    await flipDriverColumns(db, endpoints, 'local', 's3')
    await requireHooks().flipBrandingDrivers(db, 'local', 's3')
  }
}

async function flipDriverColumns(
  db: Database,
  endpoints: ResolvedEndpoints,
  from: StorageDriver,
  to: StorageDriver,
): Promise<void> {
  const flippedImages = await db.select({ path: image.storagePath }).from(image).where(eq(image.storageDriver, from))
  const imagePaths = flippedImages.map((row) => row.path)
  await db.update(image).set({ storageDriver: to }).where(eq(image.storageDriver, from))
  await db.update(music).set({ storageDriver: to }).where(eq(music.storageDriver, from))
  await db.update(fontTable).set({ storageDriver: to }).where(eq(fontTable.storageDriver, from))
  await db.update(backupTable).set({ storageDriver: to }).where(eq(backupTable.storageDriver, from))
  // The imageMeta cache carries the driver — invalidate every flipped row.
  if (imagePaths.length > 0) {
    await requireHooks().invalidateImageMeta(db, imagePaths)
  }
}

function throwIfCancelled(handle: RunningHandle): void {
  if (handle.cancelRequested) {
    throw new MigrationCancelled()
  }
}

async function persistPhase(db: Database, phase: StorageMigrationInFlightPhase): Promise<void> {
  await db.update(storageMigration).set({ phase, updatedAt: new Date() }).where(eq(storageMigration.id, SINGLETON_ID))
}

async function persistCounters(
  db: Database,
  counters: { copiedObjects: number; copiedBytes: number; skippedObjects: number },
  cursor: string | null,
): Promise<void> {
  await db
    .update(storageMigration)
    .set({
      copiedObjects: counters.copiedObjects,
      copiedBytes: counters.copiedBytes,
      skippedObjects: counters.skippedObjects,
      ...(cursor !== null ? { cursor } : {}),
      updatedAt: new Date(),
    })
    .where(eq(storageMigration.id, SINGLETON_ID))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
