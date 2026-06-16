import { call } from '@orpc/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { makeAuthedCtx } from '#/_helpers/mock-ctx'

vi.mock('@/server/domains/audit/repos/query', () => ({
  countAuditLogs: vi.fn(),
  listAuditLogs: vi.fn(),
  fetchAuditLogActorMap: vi.fn(),
  fetchAuditLogActors: vi.fn(),
}))

vi.mock('@/server/domains/audit/highlight', () => ({
  highlightAuditLogDetails: vi.fn((details: string | null) => Promise.resolve(details)),
}))

const query = await import('@/server/domains/audit/repos/query')
const { auditLogRouter } = await import('@/server/http/controllers/admin/audit.controller')

const ctx = makeAuthedCtx({ role: 'admin' })

const baseRow = {
  id: 1n,
  action: 'login',
  resourceType: 'session',
  actorId: null,
  actorRole: null,
  resourceId: null,
  details: null,
  ipAddress: null,
  userAgent: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
}

describe('auditLogRouter.list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns items with hasMore=false when all rows fit in the limit', async () => {
    vi.mocked(query.countAuditLogs).mockResolvedValue(1)
    vi.mocked(query.listAuditLogs).mockResolvedValue([baseRow])
    vi.mocked(query.fetchAuditLogActorMap).mockResolvedValue(new Map())

    const result = await call(auditLogRouter.list, { offset: 0, limit: 20 }, { context: ctx })
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.hasMore).toBe(false)
  })

  it('returns hasMore=true when more rows exist beyond the limit', async () => {
    vi.mocked(query.countAuditLogs).mockResolvedValue(25)
    vi.mocked(query.listAuditLogs).mockResolvedValue(Array.from({ length: 20 }, () => baseRow))
    vi.mocked(query.fetchAuditLogActorMap).mockResolvedValue(new Map())

    const result = await call(auditLogRouter.list, { offset: 0, limit: 20 }, { context: ctx })
    expect(result.items).toHaveLength(20)
    expect(result.hasMore).toBe(true)
  })

  it('rejects an invalid actorId with BAD_REQUEST', async () => {
    await expect(
      call(auditLogRouter.list, { offset: 0, limit: 20, actorId: 'not-valid' }, { context: ctx }),
    ).rejects.toThrow(/actorId/)
  })
})

describe('auditLogRouter.exportCsv', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a UTF-8 BOM CSV with headers', async () => {
    vi.mocked(query.countAuditLogs).mockResolvedValue(1)
    vi.mocked(query.listAuditLogs).mockResolvedValue([{ ...baseRow, ipAddress: '127.0.0.1' }])
    vi.mocked(query.fetchAuditLogActorMap).mockResolvedValue(new Map())

    const csv = await call(auditLogRouter.exportCsv, { includeFullIp: false }, { context: ctx })
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain(
      'id,action,actorId,actorName,actorRole,resourceType,resourceId,details,ipAddress,userAgentMasked,createdAt',
    )
    expect(csv).toContain('1,login')
  })

  it('includes full IP when requested', async () => {
    vi.mocked(query.countAuditLogs).mockResolvedValue(1)
    vi.mocked(query.listAuditLogs).mockResolvedValue([{ ...baseRow, ipAddress: '127.0.0.1' }])
    vi.mocked(query.fetchAuditLogActorMap).mockResolvedValue(new Map())

    const csv = await call(auditLogRouter.exportCsv, { includeFullIp: true }, { context: ctx })
    expect(csv).toContain('127.0.0.1')
  })

  it('rejects export when row count exceeds the limit', async () => {
    vi.mocked(query.countAuditLogs).mockResolvedValue(10_001)

    await expect(call(auditLogRouter.exportCsv, { includeFullIp: false }, { context: ctx })).rejects.toThrow(/10000/)
  })

  it('rejects an invalid actorId with BAD_REQUEST', async () => {
    await expect(
      call(auditLogRouter.exportCsv, { actorId: 'not-valid', includeFullIp: false }, { context: ctx }),
    ).rejects.toThrow(/actorId/)
  })
})

describe('auditLogRouter.actors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns distinct actors as DTOs', async () => {
    vi.mocked(query.fetchAuditLogActors).mockResolvedValue([
      { id: 1n, name: 'Alice', email: 'alice@example.com' },
      { id: 2n, name: 'Bob', email: 'bob@example.com' },
    ])

    const result = await call(auditLogRouter.actors, {}, { context: ctx })
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ actorId: '1', actorName: 'Alice', email: 'alice@example.com' })
  })
})
