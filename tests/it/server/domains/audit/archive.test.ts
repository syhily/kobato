import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/services/test-utils'

// The storage seam stays real (registry → S3 backend); only the AWS SDK is
// mocked at the boundary. That keeps the availability checks honest — the
// half-configured cases below exercise the backend's real `isAvailable()`.
const dbDeleteWhere = vi.fn(() => Promise.resolve({ rowCount: 0 })) as ReturnType<typeof vi.fn>
const dbSelectLimit = vi.fn(() => Promise.resolve([])) as ReturnType<typeof vi.fn>
const dbSelectOrderBy = vi.fn(() => ({ limit: dbSelectLimit })) as ReturnType<typeof vi.fn>
const dbSelectWhere = vi.fn(() => ({ orderBy: dbSelectOrderBy })) as ReturnType<typeof vi.fn>
const dbSelectFrom = vi.fn(() => ({ where: dbSelectWhere })) as ReturnType<typeof vi.fn>
const dbSelect = vi.fn(() => ({ from: dbSelectFrom })) as ReturnType<typeof vi.fn>

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

const logSpies = vi.hoisted(() => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }))

vi.mock('@/server/infra/logger', () => ({
  getLogger: () => logSpies,
}))

vi.mock('@/server/domains/audit/services/record', () => ({ recordAuditEvent: vi.fn() }))

const db = {
  delete: vi.fn(() => ({ where: dbDeleteWhere })),
  select: dbSelect,
} as any

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

const { archiveExpiredAuditLogs, cleanupExpiredArchives } = await import('@/server/domains/audit/services/archive')

describe('audit/archive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
  })

  describe('archiveExpiredAuditLogs', () => {
    it('returns zeroes when no days need archiving', async () => {
      dbSelectFrom.mockReturnValueOnce({
        where: vi.fn(() => ({
          groupBy: vi.fn(() => ({ orderBy: vi.fn(() => Promise.resolve([])) })),
        })),
      })

      const result = await archiveExpiredAuditLogs(db)
      expect(result).toEqual({ archivedDays: 0, archivedRows: 0, deletedRows: 0 })
    })

    it('skips upload when no rows are found for a day (idempotency)', async () => {
      const oldDay = '2026-01-01'
      dbSelectFrom.mockReturnValueOnce({
        where: vi.fn(() => ({
          groupBy: vi.fn(() => ({
            orderBy: vi.fn(() => Promise.resolve([{ day: oldDay, count: 0 }])),
          })),
        })),
      })

      // Second select (pagination) returns empty
      dbSelectWhere.mockReturnValueOnce({ orderBy: dbSelectOrderBy })
      dbSelectLimit.mockReturnValueOnce(Promise.resolve([]))

      const result = await archiveExpiredAuditLogs(db)
      expect(result.archivedDays).toBe(1)
      expect(sendMock).not.toHaveBeenCalled()
    })

    it('archives rows and deletes them after successful upload', async () => {
      const oldDay = '2026-01-01'
      dbSelectFrom.mockReturnValueOnce({
        where: vi.fn(() => ({
          groupBy: vi.fn(() => ({
            orderBy: vi.fn(() => Promise.resolve([{ day: oldDay, count: 3 }])),
          })),
        })),
      })

      const rows = [
        {
          id: 1n,
          action: 'login',
          actorId: 1n,
          actorRole: 'admin',
          resourceType: 'session',
          resourceId: 's1',
          details: null,
          ipAddress: null,
          userAgent: null,
          createdAt: new Date('2026-01-01T12:00:00Z'),
        },
      ]
      dbSelectWhere.mockReturnValueOnce({ orderBy: dbSelectOrderBy })
      dbSelectLimit.mockReturnValueOnce(Promise.resolve(rows))

      dbDeleteWhere.mockResolvedValueOnce({ rowCount: 1 })
      sendMock.mockResolvedValue({})

      const result = await archiveExpiredAuditLogs(db)
      expect(result.archivedRows).toBe(1)
      expect(sendMock).toHaveBeenCalledOnce()
      const input = commandInput(0)
      expect(input.Key).toBe('audit-log/archive/2026-01-01.jsonl.gz')
      expect(input.ContentType).toBe('application/gzip')
      expect(input.CacheControl).toContain('private')
      expect(dbDeleteWhere).toHaveBeenCalledOnce()
    })

    it('purges expired rows without archiving when S3 is disabled', async () => {
      setS3Storage({ enabled: false })

      dbDeleteWhere.mockResolvedValueOnce({ rowCount: 42 })

      const result = await archiveExpiredAuditLogs(db)
      expect(result).toEqual({ archivedDays: 0, archivedRows: 0, deletedRows: 42 })
      expect(sendMock).not.toHaveBeenCalled()
      expect(dbDeleteWhere).toHaveBeenCalledOnce()
    })

    it('purges expired rows without archiving when S3 secret key is empty', async () => {
      setS3Storage({ secretAccessKey: '' })

      dbDeleteWhere.mockResolvedValueOnce({ rowCount: 10 })

      const result = await archiveExpiredAuditLogs(db)
      expect(result).toEqual({ archivedDays: 0, archivedRows: 0, deletedRows: 10 })
      expect(sendMock).not.toHaveBeenCalled()
    })

    // Q4: a half-configured bucket (enabled + keys present, endpoint missing)
    // must take the purge fallback — one warn, zero errors — instead of
    // attempting the archive and logging an error every daily run.
    it('purges expired rows when S3 is half-configured (endpoint missing)', async () => {
      setS3Storage({ endpoint: '' })

      dbDeleteWhere.mockResolvedValueOnce({ rowCount: 7 })

      const result = await archiveExpiredAuditLogs(db)
      expect(result).toEqual({ archivedDays: 0, archivedRows: 0, deletedRows: 7 })
      expect(sendMock).not.toHaveBeenCalled()
      expect(logSpies.warn).toHaveBeenCalledTimes(1)
      expect(logSpies.warn).toHaveBeenCalledWith('S3 storage unavailable; purging expired audit logs without archiving')
      expect(logSpies.error).not.toHaveBeenCalled()
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
