import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'
import type { PutStreamInput, StorageBackend } from '@/server/infra/storage/backend'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeMemoryBackend } from '#/_helpers/memory-storage'
import {
  cleanupOldBackups,
  createBackup,
  deleteBackup,
  getBackupStream,
  isValidBackupStoragePath,
} from '@/server/domains/backup/services/backup'
import { findBackupByTimestamp, insertBackup } from '@/server/infra/db/operations/backup'
import { DomainError } from '@/server/infra/http/errors'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@/server/infra/storage/registry'

// createBackup runs for REAL (VACUUM INTO works from :memory:) against an
// in-memory backend; pins: overlapping same-second backups get CONFLICT,
// stale staging files never block the next run.
const mem = makeMemoryBackend()
const db = getTestDb()

beforeEach(async () => {
  __setStorageBackendForTests('s3', mem.backend)
  await clearAllTables(db)
})

afterEach(() => {
  __resetStorageBackendsForTests()
  mem.reset()
})

describe('createBackup — single-flight guard', () => {
  it('rejects a concurrent backup with CONFLICT while the first is still in flight', async () => {
    // Stall the first backup mid-upload so the second starts while the slot is held.
    let enteredPutStream!: () => void
    const putStreamEntered = new Promise<void>((resolve) => {
      enteredPutStream = resolve
    })
    let releaseUpload!: () => void
    const uploadGate = new Promise<void>((resolve) => {
      releaseUpload = resolve
    })

    const gated: StorageBackend = {
      ...mem.backend,
      async putStream(input: PutStreamInput) {
        enteredPutStream()
        await uploadGate
        return mem.backend.putStream(input)
      },
    }
    __setStorageBackendForTests('s3', gated)

    const first = createBackup(db)
    await putStreamEntered

    const conflict = await createBackup(db as Database).then(
      () => {
        throw new Error('second backup unexpectedly succeeded')
      },
      (error: unknown) => error,
    )
    expect(conflict).toBeInstanceOf(DomainError)
    expect((conflict as DomainError).code).toBe('CONFLICT')

    releaseUpload()
    const result = await first
    expect(result.fileName).toMatch(/^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[0-9a-f]{16}\.db\.tar\.gz$/)
    expect(mem.store.has(`backup/${result.fileName}`)).toBe(true)
  })

  it('ignores a stale staging file a crashed same-second attempt left behind', async () => {
    // Stale staging files (`kobato-backup-<ts>.db`) around now — timestamps are second-precision.
    const stalePaths: string[] = []
    for (let offset = -2; offset <= 2; offset += 1) {
      const ts = new Date(Date.now() + offset * 1000).toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const stalePath = join(tmpdir(), `kobato-backup-${ts}.db`)
      writeFileSync(stalePath, 'stale')
      stalePaths.push(stalePath)
    }
    try {
      const result = await createBackup(db)
      expect(result.size).toBeGreaterThan(0)
      expect(mem.store.has(`backup/${result.fileName}`)).toBe(true)
    } finally {
      for (const stalePath of stalePaths) {
        rmSync(stalePath, { force: true })
      }
    }
  })
})

describe('backup service — storage_path validation (a restored DB can forge it)', () => {
  const TIMESTAMP = '2026-01-01T00-00-00'
  const VALID_KEY = `backup/backup-${TIMESTAMP}.db.tar.gz`
  const ASSET_KEY = 'images/2026/05/live.jpg'

  it('accepts every generated key shape and rejects anything outside backup/', () => {
    expect(isValidBackupStoragePath(VALID_KEY)).toBe(true)
    expect(isValidBackupStoragePath(`backup/backup-${TIMESTAMP}-0123456789abcdef.db.tar.gz.enc`)).toBe(true)
    // Legacy content-only archive generation.
    expect(isValidBackupStoragePath(`backup/backup-${TIMESTAMP}.db.gz`)).toBe(true)

    expect(isValidBackupStoragePath(ASSET_KEY)).toBe(false)
    expect(isValidBackupStoragePath('backup/../images/x.jpg')).toBe(false)
    expect(isValidBackupStoragePath('backup/backup-not-a-timestamp.db.tar.gz')).toBe(false)
    expect(isValidBackupStoragePath(`other/backup-${TIMESTAMP}.db.tar.gz`)).toBe(false)
  })

  it('refuses to stream a row whose path is not a backup key, without opening the object', async () => {
    await mem.backend.put({ key: ASSET_KEY, body: Buffer.from('asset-bytes'), contentType: 'image/jpeg' })
    await insertBackup(db, { timestamp: TIMESTAMP, storagePath: ASSET_KEY, storageDriver: 's3', byteSize: 11 })
    const getStreamSpy = vi.spyOn(mem.backend, 'getStream')

    await expect(getBackupStream(db, TIMESTAMP)).rejects.toMatchObject({ status: 400 })
    expect(getStreamSpy).not.toHaveBeenCalled()
  })

  it('delete drops the forged row but never deletes the object it names', async () => {
    await mem.backend.put({ key: ASSET_KEY, body: Buffer.from('asset-bytes'), contentType: 'image/jpeg' })
    await insertBackup(db, { timestamp: TIMESTAMP, storagePath: ASSET_KEY, storageDriver: 's3', byteSize: 11 })

    await deleteBackup(db, TIMESTAMP)

    expect(mem.deletedKeys).not.toContain(ASSET_KEY)
    expect(mem.store.has(ASSET_KEY)).toBe(true)
    expect(await findBackupByTimestamp(db, TIMESTAMP)).toBeNull()
  })

  it('the retention sweep skips a forged path but still drops the row', async () => {
    await mem.backend.put({ key: ASSET_KEY, body: Buffer.from('asset-bytes'), contentType: 'image/jpeg' })
    await insertBackup(db, {
      timestamp: TIMESTAMP,
      storagePath: ASSET_KEY,
      storageDriver: 's3',
      byteSize: 11,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    })

    await cleanupOldBackups(db, 1)

    expect(mem.deletedKeys).not.toContain(ASSET_KEY)
    expect(mem.store.has(ASSET_KEY)).toBe(true)
    expect(await findBackupByTimestamp(db, TIMESTAMP)).toBeNull()
  })

  it('a valid row still deletes its object', async () => {
    await mem.backend.put({ key: VALID_KEY, body: Buffer.from('archive'), contentType: 'application/gzip' })
    await insertBackup(db, { timestamp: TIMESTAMP, storagePath: VALID_KEY, storageDriver: 's3', byteSize: 7 })

    await deleteBackup(db, TIMESTAMP)

    expect(mem.deletedKeys).toContain(VALID_KEY)
    expect(mem.store.has(VALID_KEY)).toBe(false)
  })
})
