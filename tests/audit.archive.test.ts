import { beforeEach, describe, expect, it, vi } from 'vitest'

const dbDeleteWhere = vi.fn(() => Promise.resolve({ rowCount: 0 })) as ReturnType<typeof vi.fn>
const dbSelectLimit = vi.fn(() => Promise.resolve([])) as ReturnType<typeof vi.fn>
const dbSelectOrderBy = vi.fn(() => ({ limit: dbSelectLimit })) as ReturnType<typeof vi.fn>
const dbSelectWhere = vi.fn(() => ({ orderBy: dbSelectOrderBy })) as ReturnType<typeof vi.fn>
const dbSelectFrom = vi.fn(() => ({ where: dbSelectWhere })) as ReturnType<typeof vi.fn>
const dbSelect = vi.fn(() => ({ from: dbSelectFrom })) as ReturnType<typeof vi.fn>

const listS3Objects = vi.fn()
const putS3Object = vi.fn()
const deleteS3Objects = vi.fn()

function createBundle(s3Enabled: boolean, secretAccessKey: string) {
  return {
    limits: { auditLogDbRetentionDays: 30, auditLogArchiveRetentionDays: 180 },
    assets: {
      storage: {
        enabled: s3Enabled,
        secretAccessKey,
      },
    },
  }
}

const getBlogSettingsBundleSync = vi.fn(() => createBundle(true, 'test-secret'))

vi.mock('@/server/infra/storage/s3-client', () => ({
  listS3Objects,
  putS3Object,
  deleteS3Objects,
}))

vi.mock('@/shared/config/getters', () => ({ getBlogSettingsBundleSync }))

vi.mock('@/server/infra/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}))

vi.mock('@/server/domains/audit/service', () => ({ recordAuditEvent: vi.fn() }))

const db = {
  delete: vi.fn(() => ({ where: dbDeleteWhere })),
  select: dbSelect,
} as any

const { archiveExpiredAuditLogs, cleanupExpiredArchives } = await import('@/server/domains/audit/archive')

describe('audit/archive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getBlogSettingsBundleSync.mockReturnValue(createBundle(true, 'test-secret'))
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
      expect(putS3Object).not.toHaveBeenCalled()
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

      const result = await archiveExpiredAuditLogs(db)
      expect(result.archivedRows).toBe(1)
      expect(putS3Object).toHaveBeenCalledOnce()
      expect(dbDeleteWhere).toHaveBeenCalledOnce()
    })

    it('purges expired rows without archiving when S3 is disabled', async () => {
      getBlogSettingsBundleSync.mockReturnValue(createBundle(false, ''))

      dbDeleteWhere.mockResolvedValueOnce({ rowCount: 42 })

      const result = await archiveExpiredAuditLogs(db)
      expect(result).toEqual({ archivedDays: 0, archivedRows: 0, deletedRows: 42 })
      expect(putS3Object).not.toHaveBeenCalled()
      expect(dbDeleteWhere).toHaveBeenCalledOnce()
    })

    it('purges expired rows without archiving when S3 secret key is empty', async () => {
      getBlogSettingsBundleSync.mockReturnValue(createBundle(true, ''))

      dbDeleteWhere.mockResolvedValueOnce({ rowCount: 10 })

      const result = await archiveExpiredAuditLogs(db)
      expect(result).toEqual({ archivedDays: 0, archivedRows: 0, deletedRows: 10 })
      expect(putS3Object).not.toHaveBeenCalled()
    })
  })

  describe('cleanupExpiredArchives', () => {
    it('deletes S3 objects older than archive retention', async () => {
      const veryOld = new Date()
      veryOld.setDate(veryOld.getDate() - 365)

      listS3Objects.mockResolvedValueOnce([
        { key: 'audit-log/archive/2025-01-01.jsonl.gz', lastModified: veryOld },
        { key: 'audit-log/archive/2026-05-01.jsonl.gz', lastModified: new Date() },
      ])

      const result = await cleanupExpiredArchives()
      expect(result.deletedFiles).toBe(1)
      expect(deleteS3Objects).toHaveBeenCalledWith(['audit-log/archive/2025-01-01.jsonl.gz'])
    })

    it('returns zero when nothing is expired', async () => {
      listS3Objects.mockResolvedValueOnce([{ key: 'audit-log/archive/2026-05-01.jsonl.gz', lastModified: new Date() }])

      const result = await cleanupExpiredArchives()
      expect(result.deletedFiles).toBe(0)
      expect(deleteS3Objects).not.toHaveBeenCalled()
    })

    it('skips cleanup when S3 is disabled', async () => {
      getBlogSettingsBundleSync.mockReturnValue(createBundle(false, ''))

      const result = await cleanupExpiredArchives()
      expect(result.deletedFiles).toBe(0)
      expect(listS3Objects).not.toHaveBeenCalled()
      expect(deleteS3Objects).not.toHaveBeenCalled()
    })

    it('skips cleanup when S3 secret key is empty', async () => {
      getBlogSettingsBundleSync.mockReturnValue(createBundle(true, ''))

      const result = await cleanupExpiredArchives()
      expect(result.deletedFiles).toBe(0)
      expect(listS3Objects).not.toHaveBeenCalled()
      expect(deleteS3Objects).not.toHaveBeenCalled()
    })
  })
})
