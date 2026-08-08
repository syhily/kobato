import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Database } from '@/server/infra/db/database'
import type { PutStreamInput, StorageBackend } from '@/server/infra/storage/backend'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeMemoryBackend } from '#/_helpers/memory-storage'
import { createBackup } from '@/server/domains/backup/services/backup'
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
    expect(result.fileName).toMatch(/^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db\.tar\.gz$/)
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
