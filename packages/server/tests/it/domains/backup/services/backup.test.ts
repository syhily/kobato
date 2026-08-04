import type { Database } from '@kobato/server/infra/db/database'
import type { PutStreamInput, StorageBackend } from '@kobato/server/infra/storage/backend'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeMemoryBackend } from '#/_helpers/memory-storage'

import { createBackup } from '@kobato/server/domains/backup/services/backup'
import { DomainError } from '@kobato/server/infra/http/errors'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@kobato/server/infra/storage/registry'
import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// createBackup runs for REAL against the shared in-memory DB (VACUUM INTO
// works from :memory:) and an in-memory storage backend — no S3, no
// settings. These cases pin the concurrency fix: two backups overlapping
// in the same second (second-precision timestamp → shared staging path /
// S3 key / DB row) must not fail opaquely — the loser gets a DomainError
// CONFLICT, and a stale staging file from a crashed attempt never blocks
// the next run.
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
    // Stall the first backup mid-upload so the second attempt starts while
    // the first still holds the slot — the interleaving two same-second
    // admin clicks (or an overlapping scheduler tick) produce.
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
    expect(result.fileName).toMatch(/^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db\.tar\.gz$/)
    expect(mem.store.has(`backup/${result.fileName}`)).toBe(true)
  })

  it('ignores a stale staging file a crashed same-second attempt left behind', async () => {
    // A backup that died between `VACUUM INTO` and the cleanup unlink left
    // `kobato-backup-<timestamp>.db` in the temp dir; the next backup in
    // the same second used to fail its own VACUUM INTO on that existing
    // file ("output file already exists"). The timestamp is
    // second-precision, so seed stale files for a ±2s window around now.
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
