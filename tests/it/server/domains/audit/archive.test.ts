import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE, setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { auditLog } from '@/server/infra/db/schema/config'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@/server/infra/logger'

// Real in-memory engine for the DB side: expired rows are real
// `audit_log` rows and every assertion reads the table back. The storage
// seam stays real too (registry → S3 backend); only the AWS SDK is mocked
// at the boundary. That keeps the availability checks honest — the
// half-configured cases below exercise the backend's real `isAvailable()`.
const sendMock = vi.fn<(command: { input: unknown }) => Promise<unknown>>()
const destroyMock = vi.fn()
const middlewareStack = { addRelativeTo: vi.fn() }

vi.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    send = sendMock
    destroy = destroyMock
    middlewareStack = middlewareStack
    constructor(public config: unknown) {}
  }
  class PutObjectCommand {
    constructor(public input: unknown) {}
  }
  class ListObjectsV2Command {
    constructor(public input: unknown) {}
  }
  class DeleteObjectsCommand {
    constructor(public input: unknown) {}
  }
  return { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand }
})

const db = getTestDb()

// Comfortably older than any retention cutoff the fixture can produce.
const OLD_DAY = new Date('2026-01-01T12:00:00Z')

async function seedAuditRow(overrides: Partial<typeof auditLog.$inferInsert> = {}): Promise<void> {
  await db.insert(auditLog).values({ action: 'login', resourceType: 'session', createdAt: OLD_DAY, ...overrides })
}

type StorageOverrides = Partial<NonNullable<(typeof TEST_BLOG_SETTINGS_BUNDLE)['assets']>['storage']>

function setS3Storage(overrides: StorageOverrides) {
  const assets = TEST_BLOG_SETTINGS_BUNDLE.assets!
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    assets: { ...assets, storage: { ...assets.storage, ...overrides } },
  })
}

interface SentCommandInput {
  Key?: string
  ContentType?: string
  CacheControl?: string
  Delete?: { Objects?: { Key: string }[] }
}

function commandInput(call: number): SentCommandInput {
  return (sendMock.mock.calls[call]![0] as { input: SentCommandInput }).input
}

const { archiveExpiredAuditLogs, cleanupExpiredArchives, deleteArchivedRows } =
  await import('@/server/domains/audit/services/archive')

describe('audit/archive', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    __clearLogCaptureForTests()
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    await clearAllTables(db)
  })

  describe('archiveExpiredAuditLogs', () => {
    it('returns zeroes when no rows are past the retention cutoff', async () => {
      await seedAuditRow({ createdAt: new Date(), action: 'fresh' })

      const result = await archiveExpiredAuditLogs(db)
      expect(result).toEqual({ archivedDays: 0, archivedRows: 0, deletedRows: 0 })
      expect(sendMock).not.toHaveBeenCalled()
      expect(await db.select().from(auditLog)).toHaveLength(1)
    })

    it('archives expired rows and deletes them after a successful upload', async () => {
      await seedAuditRow({ action: 'login' })
      await seedAuditRow({ action: 'logout' })
      await seedAuditRow({ createdAt: new Date(), action: 'fresh' })
      sendMock.mockResolvedValue({})

      const result = await archiveExpiredAuditLogs(db)
      expect(result).toEqual({ archivedDays: 1, archivedRows: 2, deletedRows: 2 })
      expect(sendMock).toHaveBeenCalledOnce()
      const input = commandInput(0)
      expect(input.Key).toBe('audit-log/archive/2026-01-01.jsonl.gz')
      expect(input.ContentType).toBe('application/gzip')
      expect(input.CacheControl).toContain('private')

      // Only the archived rows are gone; the fresh row is untouched.
      const remaining = await db.select().from(auditLog)
      expect(remaining).toHaveLength(1)
      expect(remaining[0]?.action).toBe('fresh')
    })

    it('purges expired rows without archiving when S3 is disabled', async () => {
      setS3Storage({ enabled: false })
      await seedAuditRow()
      await seedAuditRow()
      await seedAuditRow({ createdAt: new Date(), action: 'fresh' })

      const result = await archiveExpiredAuditLogs(db)
      expect(result).toEqual({ archivedDays: 0, archivedRows: 0, deletedRows: 2 })
      expect(sendMock).not.toHaveBeenCalled()
      const remaining = await db.select().from(auditLog)
      expect(remaining).toHaveLength(1)
      expect(remaining[0]?.action).toBe('fresh')
    })

    it('purges expired rows without archiving when S3 secret key is empty', async () => {
      setS3Storage({ secretAccessKey: '' })
      await seedAuditRow()

      const result = await archiveExpiredAuditLogs(db)
      expect(result).toEqual({ archivedDays: 0, archivedRows: 0, deletedRows: 1 })
      expect(sendMock).not.toHaveBeenCalled()
      expect(await db.select().from(auditLog)).toHaveLength(0)
    })

    // Q4: a half-configured bucket (enabled + keys present, endpoint missing)
    // must take the purge fallback — one warn, zero errors — instead of
    // attempting the archive and logging an error every daily run.
    it('purges expired rows when S3 is half-configured (endpoint missing)', async () => {
      setS3Storage({ endpoint: '' })
      await seedAuditRow()

      const result = await archiveExpiredAuditLogs(db)
      expect(result).toEqual({ archivedDays: 0, archivedRows: 0, deletedRows: 1 })
      expect(sendMock).not.toHaveBeenCalled()
      expect(await db.select().from(auditLog)).toHaveLength(0)
      expect(__logCaptureForTests().filter((e) => e.level === 'warn')).toHaveLength(1)
      expect(__logCaptureForTests()).toContainEqual(
        expect.objectContaining({
          level: 'warn',
          msg: 'S3 storage unavailable; purging expired audit logs without archiving',
        }),
      )
      expect(__logCaptureForTests().some((e) => e.level === 'error')).toBe(false)
    })
  })

  describe('deleteArchivedRows', () => {
    it('deletes in batches when the id list exceeds one batch', async () => {
      // Five rows with a batch size of two → three DELETE statements,
      // every row gone by the end.
      for (let i = 0; i < 5; i++) {
        await seedAuditRow()
      }
      const ids = (await db.select({ id: auditLog.id }).from(auditLog)).map((row) => row.id)
      expect(ids).toHaveLength(5)
      const deleteSpy = vi.spyOn(db, 'delete')

      const deleted = await deleteArchivedRows(db, ids, 2)

      expect(deleted).toBe(5)
      expect(deleteSpy).toHaveBeenCalledTimes(3)
      expect(await db.select().from(auditLog)).toHaveLength(0)
    })

    it('deletes nothing for an empty id list', async () => {
      const deleteSpy = vi.spyOn(db, 'delete')

      expect(await deleteArchivedRows(db, [])).toBe(0)
      expect(deleteSpy).not.toHaveBeenCalled()
    })
  })

  describe('cleanupExpiredArchives', () => {
    it('deletes S3 objects older than archive retention', async () => {
      const veryOld = new Date()
      veryOld.setDate(veryOld.getDate() - 365)

      sendMock.mockResolvedValueOnce({
        Contents: [
          { Key: 'audit-log/archive/2025-01-01.jsonl.gz', Size: 10, LastModified: veryOld },
          { Key: 'audit-log/archive/2026-05-01.jsonl.gz', Size: 10, LastModified: new Date() },
        ],
      })
      sendMock.mockResolvedValueOnce({})

      const result = await cleanupExpiredArchives()
      expect(result.deletedFiles).toBe(1)
      expect(sendMock).toHaveBeenCalledTimes(2)
      expect(commandInput(1).Delete?.Objects).toEqual([{ Key: 'audit-log/archive/2025-01-01.jsonl.gz' }])
    })

    it('returns zero when nothing is expired', async () => {
      sendMock.mockResolvedValueOnce({
        Contents: [{ Key: 'audit-log/archive/2026-05-01.jsonl.gz', Size: 10, LastModified: new Date() }],
      })

      const result = await cleanupExpiredArchives()
      expect(result.deletedFiles).toBe(0)
      expect(sendMock).toHaveBeenCalledTimes(1)
    })

    it('skips cleanup when S3 is disabled', async () => {
      setS3Storage({ enabled: false })

      const result = await cleanupExpiredArchives()
      expect(result.deletedFiles).toBe(0)
      expect(sendMock).not.toHaveBeenCalled()
    })

    it('skips cleanup when S3 secret key is empty', async () => {
      setS3Storage({ secretAccessKey: '' })

      const result = await cleanupExpiredArchives()
      expect(result.deletedFiles).toBe(0)
      expect(sendMock).not.toHaveBeenCalled()
    })
  })
})
