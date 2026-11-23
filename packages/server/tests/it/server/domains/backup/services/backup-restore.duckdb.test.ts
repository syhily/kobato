import type { AnalyticsHandle } from '@kobato/db/duckdb/connection'

import { engineOf } from '@kobato/db/duckdb/connection'
import { sqliteOf as sqlite } from '@kobato/db/sqlite/database'
import {
  __adoptAnalyticsHandleForTests,
  __resetAnalyticsEngineForTests,
  snapshotAnalyticsTo,
} from '@kobato/server/bootstrap/analytics-lifecycle'
import { closeTestAnalyticsDb, createTestAnalyticsDb, seedAccessEvents } from '@kobato/server/tests/utils/analytics-db'
import { clearAllTables, createTestDatabaseFile, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeMemoryBackend } from '@kobato/server/tests/utils/memory-storage'
import { eq } from 'drizzle-orm'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

let analyticsHandle: AnalyticsHandle

import { createNotificationWithRecipients } from '@kobato/db/sqlite/operations/engagement/notification'
import { findBackupByTimestamp } from '@kobato/db/sqlite/operations/system/backup'
import { notification } from '@kobato/db/sqlite/schema/notification'
import { post } from '@kobato/db/sqlite/schema/post'
import { category } from '@kobato/db/sqlite/schema/taxonomy'
import { createBackup, getBackupBuffer, wireBackupSnapshots } from '@kobato/server/domains/backup/services/backup'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@kobato/server/infra/storage/registry'
import { extractBackupFile, unpackBackupPayload } from '@kobato/server/tests/utils/backup-buffer'

const mem = makeMemoryBackend()

const db = getTestDb()

beforeEach(async () => {
  __setStorageBackendForTests('s3', mem.backend)
  analyticsHandle = await createTestAnalyticsDb()
  __resetAnalyticsEngineForTests()
  __adoptAnalyticsHandleForTests(analyticsHandle)
  wireBackupSnapshots({ snapshotAnalyticsTo })
  await clearAllTables(db)
})

afterEach(() => {
  __resetStorageBackendsForTests()
  mem.reset()
})

afterAll(async () => {
  __resetAnalyticsEngineForTests()
  await closeTestAnalyticsDb(analyticsHandle)
})

describe('backup and restore integration', () => {
  it('creates a two-file tar.gz archive (content + analytics) that round-trips through the storage backend', async () => {
    await sqlite(db)
      .insert(category)
      .values({ name: 'BackupCat', slug: 'backup-cat', cover: '', description: '', sortOrder: 0 })
      .run()
    await seedAccessEvents(analyticsHandle, [
      { ts: new Date(), path: '/one', visitorHash: 'v1' },
      { ts: new Date(), path: '/two', visitorHash: 'v2' },
    ])
    await sqlite(db)
      .insert(post)
      .values({
        slug: 'backup-post',
        title: 'バックアップ',
        contentLanguage: 'ja',
        publishedAt: new Date(),
      })
      .run()
    createNotificationWithRecipients(
      db,
      {
        kind: 'admin',
        senderId: null,
        title: 'Background task failed: backup',
        body: 'Task backup failed on its most recent run. Open the Tasks page for details.',
        titleKey: 'notification.job.failed.title',
        titleParams: JSON.stringify({ taskKey: 'backup' }),
        bodyKey: 'notification.job.failed.body',
        bodyParams: JSON.stringify({ taskKey: 'backup', hasError: 'no', error: '' }),
        replyable: false,
      },
      [],
    )

    const { fileName, size, timestamp } = await createBackup(db)

    expect(fileName).toMatch(/^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[0-9a-f]{16}\.db\.tar\.gz$/)
    expect(size).toBeGreaterThan(0)

    const key = `backup/${fileName}`
    const buffer = mem.store.get(key)?.body
    expect(buffer).toBeDefined()
    expect(buffer!.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]))

    const payload = unpackBackupPayload(extractBackupFile(buffer!))
    expect(payload.content!.subarray(0, 16).toString('latin1')).toBe('SQLite format 3\0')
    expect(payload.analytics).not.toBeNull()
    expect(payload.analytics!.subarray(8, 12).toString('latin1')).toBe('DUCK')

    const downloaded = await getBackupBuffer(db, timestamp)
    expect(downloaded.equals(buffer!)).toBe(true)

    const { mkdtempSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { openDatabase, closeDatabase, databaseOf, sqliteOf } = await import('@kobato/db/sqlite/database')
    const dir = mkdtempSync(join(tmpdir(), 'kobato-restore-it-'))
    const restored = openDatabase(join(dir, 'restored.db'))
    try {
      writeFileSync(restored.path, payload.content!)
      const rows = sqliteOf(databaseOf(restored)).select().from(category).where(eq(category.slug, 'backup-cat')).all()
      expect(rows).toHaveLength(1)
      expect(rows[0]!.name).toBe('BackupCat')

      const restoredPosts = sqliteOf(databaseOf(restored)).select().from(post).where(eq(post.slug, 'backup-post')).all()
      expect(restoredPosts).toHaveLength(1)
      expect(restoredPosts[0]!.contentLanguage).toBe('ja')
      expect(restoredPosts[0]!.title).toBe('バックアップ')

      const notices = sqliteOf(databaseOf(restored)).select().from(notification).all()
      expect(notices).toHaveLength(1)
      expect(notices[0]).toMatchObject({
        title: 'Background task failed: backup',
        titleKey: 'notification.job.failed.title',
        bodyKey: 'notification.job.failed.body',
      })
      expect(JSON.parse(notices[0]!.titleParams!)).toEqual({ taskKey: 'backup' })
      expect(JSON.parse(notices[0]!.bodyParams!)).toEqual({ taskKey: 'backup', hasError: 'no', error: '' })
    } finally {
      closeDatabase(restored)
    }

    const { openAnalyticsDatabase, closeAnalyticsDatabase } = await import('@kobato/db/duckdb/database')
    const { ACCESS_EVENTS_DDL } = await import('@kobato/db/duckdb/access-events')
    writeFileSync(join(dir, 'restored.duckdb'), payload.analytics!)
    const restoredAnalytics = await openAnalyticsDatabase(join(dir, 'restored.duckdb'), ACCESS_EVENTS_DDL)
    try {
      const result = await engineOf(restoredAnalytics).reader.runAndReadAll('SELECT count(*) AS c FROM access_events')
      expect(Number(result.getRowObjects()[0]?.c)).toBe(2)
    } finally {
      await closeAnalyticsDatabase(restoredAnalytics)
    }

    const { stageBackup } = await import('@kobato/server/domains/backup/services/restore')
    const staged = await stageBackup(buffer!)
    const { rmSync } = await import('node:fs')
    try {
      expect(staged.content).not.toBeNull()
      expect(staged.analytics).not.toBeNull()
      const stagedDb = openDatabase(join(dir, 'staged-copy.db'))
      try {
        const { copyFileSync } = await import('node:fs')
        copyFileSync(staged.content!, stagedDb.path)
        const rows = sqliteOf(databaseOf(stagedDb)).select().from(category).where(eq(category.slug, 'backup-cat')).all()
        expect(rows).toHaveLength(1)
      } finally {
        closeDatabase(stagedDb)
      }
    } finally {
      rmSync(staged.dir, { recursive: true, force: true })
    }
  })

  it('records the exact stored byte count and a complete gzip header (stream-pipeline regression)', async () => {
    __setStorageBackendForTests('s3', {
      ...mem.backend,
      async putStream(input) {
        await new Promise((resolve) => setTimeout(resolve, 20))
        return mem.backend.putStream(input)
      },
    })

    const { size, timestamp } = await createBackup(db)

    const row = await findBackupByTimestamp(db, timestamp)
    expect(row).not.toBeNull()

    const stored = await getBackupBuffer(db, timestamp)
    expect(stored.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]))
    expect(row!.byteSize).toBe(stored.length)
    expect(size).toBe(stored.length)
  })

  it('rejects a payload that is not a SQLite database', () => {
    expect(() => unpackBackupPayload(Buffer.from([0x00, 0x00, 0x00, 0x00]))).toThrow(ActionFailure)
    expect(() => unpackBackupPayload(Buffer.from([0x00, 0x00, 0x00, 0x00]))).toThrow('SQLite')
  })

  it('rejects an oversize payload', () => {
    const big = Buffer.concat([Buffer.from('SQLite format 3\0', 'latin1'), Buffer.alloc(501 * 1024 * 1024, 0)])
    expect(() => unpackBackupPayload(big)).toThrow(ActionFailure)
  })

  it('passes a legacy raw (ungzipped) SQLite file through as content-only', async () => {
    const fresh = createTestDatabaseFile()
    const { readFileSync } = await import('node:fs')
    const bytes: Buffer = readFileSync(fresh.path)
    const payload = unpackBackupPayload(extractBackupFile(bytes))
    expect(payload.content!.subarray(0, 16).toString('latin1')).toBe('SQLite format 3\0')
    expect(payload.analytics).toBeNull()
  })
})

describe('encrypted backups', () => {
  it('creates a .enc archive that round-trips through stageBackup with the password', async () => {
    const { createBackup, isBackupEncrypted, listBackups } =
      await import('@kobato/server/domains/backup/services/backup')
    const { isEncryptedBackup } = await import('@kobato/server/domains/backup/services/crypto')
    const { EncryptedBackupPasswordRequired, stageBackup } =
      await import('@kobato/server/domains/backup/services/restore')
    const { readFileSync, rmSync } = await import('node:fs')

    const { fileName, timestamp } = await createBackup(db, null, { passwordOverride: 'correct horse battery staple' })

    expect(fileName).toMatch(/\.db\.tar\.gz\.enc$/)
    const buffer = mem.store.get(`backup/${fileName}`)?.body
    expect(buffer).toBeDefined()
    expect(isEncryptedBackup(buffer!.subarray(0, 8))).toBe(true)

    expect(await isBackupEncrypted(db, timestamp)).toBe(true)
    const { files } = await listBackups(db)
    expect(files.find((file) => file.key === timestamp)?.encrypted).toBe(true)

    const noPassword: unknown = await stageBackup(buffer!).catch((caught: unknown) => caught)
    expect(noPassword).toBeInstanceOf(EncryptedBackupPasswordRequired)
    rmSync((noPassword as InstanceType<typeof EncryptedBackupPasswordRequired>).dir, {
      recursive: true,
      force: true,
    })

    await expect(stageBackup(buffer!, { password: 'wrong-password' })).rejects.toThrow(ActionFailure)

    const staged = await stageBackup(buffer!, { password: 'correct horse battery staple' })
    try {
      expect(staged.content).not.toBeNull()
      expect(staged.analytics).not.toBeNull()
      expect(readFileSync(staged.content!).subarray(0, 16).toString('latin1')).toBe('SQLite format 3\0')
      expect(readFileSync(staged.analytics!).subarray(8, 12).toString('latin1')).toBe('DUCK')
    } finally {
      rmSync(staged.dir, { recursive: true, force: true })
    }
  })

  it('encrypts with the wired settings password when no per-run override is given', async () => {
    const { wireBackupEncryption, resetBackupEncryption } =
      await import('@kobato/server/domains/backup/services/backup')
    const { stageBackup } = await import('@kobato/server/domains/backup/services/restore')
    const { rmSync } = await import('node:fs')

    wireBackupEncryption({ resolveEncryptionPassword: () => 'settings-password' })
    try {
      const { fileName } = await createBackup(db)
      expect(fileName).toMatch(/\.enc$/)
      const buffer = mem.store.get(`backup/${fileName}`)?.body
      expect(buffer).toBeDefined()
      const staged = await stageBackup(buffer!, { password: 'settings-password' })
      rmSync(staged.dir, { recursive: true, force: true })
      expect(staged.content).not.toBeNull()
    } finally {
      resetBackupEncryption()
    }
  })

  it('a per-run override wins over the wired settings password', async () => {
    const { wireBackupEncryption, resetBackupEncryption } =
      await import('@kobato/server/domains/backup/services/backup')
    const { stageBackup } = await import('@kobato/server/domains/backup/services/restore')
    const { rmSync } = await import('node:fs')

    wireBackupEncryption({ resolveEncryptionPassword: () => 'settings-password' })
    try {
      const { fileName } = await createBackup(db, null, { passwordOverride: 'one-off-password' })
      const buffer = mem.store.get(`backup/${fileName}`)?.body
      expect(buffer).toBeDefined()
      await expect(stageBackup(buffer!, { password: 'settings-password' })).rejects.toThrow(ActionFailure)
      const staged = await stageBackup(buffer!, { password: 'one-off-password' })
      rmSync(staged.dir, { recursive: true, force: true })
      expect(staged.content).not.toBeNull()
    } finally {
      resetBackupEncryption()
    }
  })
})
