import type { Database } from '@kobato/db/database'
import type { StorageBackend } from '@kobato/server/infra/storage/backend'
import type { AssetsSettings, StorageDriver } from '@kobato/settings/types'

import {
  isStorageMigrationInFlightPhase,
  storageMigrationVerificationDto,
  type StorageMigrationDirection,
  type StorageMigrationInFlightPhase,
  type StorageMigrationPersistedPhase,
  type StorageMigrationPhase,
  type StorageMigrationStatus,
  type StorageMigrationVerification,
} from '@kobato/api/contracts/storage'
import {
  cancelStorageMigrationRow,
  completeStorageMigrationRow,
  failStorageMigrationRow,
  findStorageMigrationRow,
  flipStorageDriverColumns,
  persistStorageMigrationCounters,
  resumeStorageMigrationRow,
  updateStorageMigrationPhase,
  upsertStorageMigrationRow,
} from '@kobato/db/operations/storage'
import { recordAuditEvent } from '@kobato/server/domains/audit/services/record'
import { decryptIfNeeded, encryptIfNeeded } from '@kobato/server/infra/crypto/secret-encryption'
import { finishJobRun, startJobRun } from '@kobato/server/infra/db/job-run-recorder'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import {
  createS3BackendFromConfig,
  validateS3Config,
  type S3ValidationResult,
} from '@kobato/server/infra/storage/backends/s3'
import { contentTypeForKey, visibilityForKey } from '@kobato/server/infra/storage/key-policy'
import { backendFor } from '@kobato/server/infra/storage/registry'
import { requireBlogSettingsSection } from '@kobato/settings/getters'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

const log = getLogger('storage.migration.task')

const LIST_BATCH_SIZE = 200
const COPY_CONCURRENCY = 4
const COPY_ATTEMPTS = 3
const PROGRESS_FLUSH_MS = 2_000
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
    super('Migration cancelled')
    this.name = 'MigrationCancelled'
  }
}

interface RunningHandle {
  cancelRequested: boolean
  promise: Promise<void>
  runId?: number | null
}

let running: RunningHandle | null = null

let targetS3BackendFactory: (storage: S3TargetConfig) => StorageBackend = createS3BackendFromConfig

let sourceS3BackendFactory: (storage: S3TargetConfig) => StorageBackend = createS3BackendFromConfig

let targetValidator: (storage: S3TargetConfig) => Promise<S3ValidationResult> = validateS3Config

export function __setS3MigrationTargetFactoryForTests(
  factory: (storage: S3TargetConfig) => StorageBackend,
  validator?: (storage: S3TargetConfig) => Promise<S3ValidationResult>,
): void {
  targetS3BackendFactory = factory
  targetValidator = validator ?? (() => Promise.resolve({ ok: true }))
}

export function __setS3MigrationSourceFactoryForTests(factory: (storage: S3TargetConfig) => StorageBackend): void {
  sourceS3BackendFactory = factory
}

export function __resetS3MigrationForTests(): void {
  running = null
  targetS3BackendFactory = createS3BackendFromConfig
  sourceS3BackendFactory = createS3BackendFromConfig
  targetValidator = validateS3Config
  hooks = null
}

export async function __awaitStorageMigrationForTests(): Promise<void> {
  await running?.promise
}

export interface S3MigrationHooks {
  readonly persistFlippedStorage: (db: Database, storage: AssetsSettings['storage']) => Promise<void>
  readonly flipBrandingDrivers: (db: Database, from: StorageDriver, to: StorageDriver) => Promise<void>
  readonly postSwitchBackfill: (db: Database) => Promise<unknown>
}

let hooks: S3MigrationHooks | null = null

export function wireS3Migration(wired: S3MigrationHooks): void {
  hooks = wired
}

function requireHooks(): S3MigrationHooks {
  if (hooks === null) {
    throw new Error('storage migration ran before wireS3Migration')
  }
  return hooks
}

export async function isStorageMigrationActive(db: Database): Promise<boolean> {
  if (running !== null) {
    return true
  }
  const row = await readRow(db)
  return row !== null && isStorageMigrationInFlightPhase(row.phase)
}

type MigrationRow = NonNullable<Awaited<ReturnType<typeof findStorageMigrationRow>>>

async function readRow(db: Database): Promise<MigrationRow | null> {
  return findStorageMigrationRow(db)
}

function rowToStatus(row: MigrationRow | null): StorageMigrationStatus {
  if (row === null) {
    return IDLE_STATUS
  }
  const targetConfig = parseStorageConfig(row.targetStorage)
  const target =
    targetConfig !== null && typeof targetConfig.bucket === 'string' && typeof targetConfig.endpoint === 'string'
      ? { bucket: targetConfig.bucket, endpoint: targetConfig.endpoint }
      : null
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

function serializeStorageConfig(config: S3TargetConfig): string {
  return JSON.stringify({ ...config, secretAccessKey: encryptIfNeeded(config.secretAccessKey ?? '') })
}

export async function startStorageMigration(db: Database, input: StartMigrationInput): Promise<StorageMigrationStatus> {
  if (running !== null) {
    throw new DomainError('CONFLICT', descriptorFor('storage.error.migrationRunning'))
  }
  const handle: RunningHandle = { cancelRequested: false, promise: Promise.resolve() }
  running = handle

  let direction: StorageMigrationDirection
  let targetConfig: S3TargetConfig | null = null
  let sourceConfig: S3TargetConfig | null = null
  try {
    const existing = await readRow(db)
    if (existing !== null && isStorageMigrationInFlightPhase(existing.phase)) {
      throw new DomainError('CONFLICT', descriptorFor('storage.error.migrationUnfinished'))
    }

    const currentStorage = requireBlogSettingsSection('assets').storage
    const s3Active = currentStorage.enabled
    sourceConfig = s3Active ? { ...currentStorage } : null

    if (input.target === 'local') {
      if (!s3Active) {
        throw new DomainError('BAD_REQUEST', descriptorFor('storage.error.s3NotEnabled'))
      }
      direction = 's3-to-local'
    } else {
      const candidate: S3TargetConfig = { ...input.config, enabled: true }
      if (s3Active) {
        direction = 's3-to-s3'
        if (sameS3Target(currentStorage, candidate)) {
          throw new DomainError('BAD_REQUEST', descriptorFor('storage.error.targetSame'))
        }
      } else {
        direction = 'local-to-s3'
      }
      const validation = await targetValidator(candidate)
      if (!validation.ok) {
        throw new DomainError('BAD_REQUEST', validation.descriptor)
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
    await upsertStorageMigrationRow(db, row)
  } catch (error) {
    if (running === handle) {
      running = null
    }
    throw error
  }

  launch(db, direction, sourceConfig, targetConfig, null, handle)
  return rowToStatus(await readRow(db))
}

export async function cancelStorageMigration(db: Database): Promise<StorageMigrationStatus> {
  const row = await readRow(db)
  if (row === null || !isStorageMigrationInFlightPhase(row.phase)) {
    throw new DomainError('BAD_REQUEST', descriptorFor('storage.error.noActiveMigration'))
  }
  if (running !== null) {
    running.cancelRequested = true
  } else {
    await cancelStorageMigrationRow(db)
  }
  return rowToStatus(await readRow(db))
}

export async function resumeStorageMigration(db: Database): Promise<StorageMigrationStatus> {
  if (running !== null) {
    throw new DomainError('CONFLICT', descriptorFor('storage.error.migrationRunning'))
  }
  const handle: RunningHandle = { cancelRequested: false, promise: Promise.resolve() }
  running = handle

  let row: MigrationRow
  try {
    const existing = await readRow(db)
    if (existing === null) {
      throw new DomainError('BAD_REQUEST', descriptorFor('storage.error.noResumableMigration'))
    }
    const resumable =
      existing.phase === 'failed' || existing.phase === 'cancelled' || isStorageMigrationInFlightPhase(existing.phase)
    if (!resumable) {
      throw new DomainError('BAD_REQUEST', descriptorFor('storage.error.alreadyComplete'))
    }
    row = existing

    await resumeStorageMigrationRow(db)
  } catch (error) {
    if (running === handle) {
      running = null
    }
    throw error
  }

  const sourceConfig =
    readSourceConfig(row) ?? (row.direction === 'local-to-s3' ? null : requireBlogSettingsSection('assets').storage)
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
  handle.runId = startJobRun('storage-migration', 'manual')
  handle.promise = runMigration(db, direction, sourceConfig, targetConfig, cursor, handle)
    .catch((error) => {
      log.error('Storage migration crashed', { error: String(error) })
    })
    .finally(() => {
      if (running === handle) {
        running = null
      }
    })
}

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

function requireSnapshot(config: S3TargetConfig | null, side: 'source' | 'target'): S3TargetConfig {
  if (config === null) {
    throw new DomainError('INTERNAL', descriptorFor('storage.error.snapshotMissing', { side }))
  }
  return config
}

function resolveEndpoints(
  direction: StorageMigrationDirection,
  sourceConfig: S3TargetConfig | null,
  targetConfig: S3TargetConfig | null,
): ResolvedEndpoints {
  const source =
    direction === 'local-to-s3' ? backendFor('local') : sourceS3BackendFactory(requireSnapshot(sourceConfig, 'source'))
  const target =
    direction === 's3-to-local' ? backendFor('local') : targetS3BackendFactory(requireSnapshot(targetConfig, 'target'))
  return direction === 's3-to-local'
    ? { direction, source, target }
    : { direction, source, target, targetConfig: requireSnapshot(targetConfig, 'target') }
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
  const progress = { cursor: resumeCursor }

  try {
    if (resumeCursor !== null) {
      const existing = await readRow(db)
      if (existing !== null) {
        counters.copiedObjects = existing.copiedObjects
        counters.copiedBytes = existing.copiedBytes
        counters.skippedObjects = existing.skippedObjects
      }
    }

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
    await completeStorageMigrationRow(db, JSON.stringify(verification))
    log.info('Storage migration completed', { direction, ...counters, verified: verification.matches })
    recordAuditEvent({
      action: 'storage_migration_completed',
      resourceType: 'storage',
      resourceId: direction,
      details: { ...counters, verified: verification.matches },
    })
    try {
      const backfill = await requireHooks().postSwitchBackfill(db)
      log.info('Post-migration asset URL backfill finished', { result: backfill })
    } catch (error) {
      log.warn('Post-migration asset URL backfill failed', { error: String(error) })
    }
    finishJobRun(handle.runId ?? null, 'success')
  } catch (error) {
    const cancelled = error instanceof MigrationCancelled
    const message = error instanceof Error ? error.message : String(error)
    finishJobRun(handle.runId ?? null, cancelled ? 'cancelled' : 'failed', cancelled ? undefined : message)
    await persistCounters(db, counters, progress.cursor)
    await failStorageMigrationRow(db, cancelled ? 'cancelled' : 'failed', cancelled ? null : message)
    log.warn('Storage migration ended', { direction, phase: cancelled ? 'cancelled' : 'failed', error: message })
    recordAuditEvent({
      action: cancelled ? 'storage_migration_cancelled' : 'storage_migration_failed',
      resourceType: 'storage',
      resourceId: direction,
      details: cancelled ? { ...counters } : { ...counters, error: message },
    })
  }
}

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

async function copyAll(
  db: Database,
  source: StorageBackend,
  target: StorageBackend,
  progress: { cursor: string | null },
  counters: { copiedObjects: number; copiedBytes: number; skippedObjects: number },
  handle: RunningHandle,
): Promise<void> {
  let lastFlush = Date.now()
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
    descriptorFor('storage.error.copyFailed', {
      attempts: COPY_ATTEMPTS,
      key: object.key,
      message: lastError instanceof Error ? lastError.message : String(lastError),
    }),
  )
}

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

async function switchStorage(db: Database, endpoints: ResolvedEndpoints): Promise<void> {
  if (endpoints.direction === 's3-to-local') {
    const current = requireBlogSettingsSection('assets')
    await requireHooks().persistFlippedStorage(db, { ...current.storage, enabled: false })
    await flipDriverColumns(db, endpoints, 's3', 'local')
    await requireHooks().flipBrandingDrivers(db, 's3', 'local')
    return
  }

  const target = endpoints.targetConfig
  await requireHooks().persistFlippedStorage(db, target)
  if (endpoints.direction === 'local-to-s3') {
    await flipDriverColumns(db, endpoints, 'local', 's3')
    await requireHooks().flipBrandingDrivers(db, 'local', 's3')
  }
}

async function flipDriverColumns(
  db: Database,
  _endpoints: ResolvedEndpoints,
  from: StorageDriver,
  to: StorageDriver,
): Promise<void> {
  await flipStorageDriverColumns(db, from, to)
}

function throwIfCancelled(handle: RunningHandle): void {
  if (handle.cancelRequested) {
    throw new MigrationCancelled()
  }
}

async function persistPhase(db: Database, phase: StorageMigrationInFlightPhase): Promise<void> {
  await updateStorageMigrationPhase(db, phase)
}

async function persistCounters(
  db: Database,
  counters: { copiedObjects: number; copiedBytes: number; skippedObjects: number },
  cursor: string | null,
): Promise<void> {
  await persistStorageMigrationCounters(db, counters, cursor)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
