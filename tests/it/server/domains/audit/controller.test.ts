import { describe, expect, it, vi } from 'vitest'

import type { AuditLogRow } from '@/server/infra/db/schema/config'

vi.mock('@/shared/config/getters', () => ({
  getBlogSettingsBundleSync: vi.fn(() => ({
    limits: { auditLogDbRetentionDays: 30, auditLogArchiveRetentionDays: 180 },
  })),
}))

const { parseDate, clampDateToRetention, toAuditLogItemDto } = await import('@/server/domains/audit/projection')
const { buildAuditLogWhere } = await import('@/server/domains/audit/services/query')
const { auditLogRouter } = await import('@/server/http/controllers/admin/audit.controller')

describe('audit/controller helpers', () => {
  describe('parseDate', () => {
    it('returns a Date for a valid ISO date string', () => {
      const d = parseDate('2026-05-20')
      expect(d).toBeInstanceOf(Date)
      expect(d?.toISOString().startsWith('2026-05-20')).toBe(true)
    })

    it('returns undefined for empty string', () => {
      expect(parseDate('')).toBeUndefined()
    })

    it('returns undefined for invalid string', () => {
      expect(parseDate('not-a-date')).toBeUndefined()
    })

    it('returns undefined for undefined', () => {
      expect(parseDate(undefined)).toBeUndefined()
    })
  })

  describe('clampDateToRetention', () => {
    it('returns the date when it is within retention', () => {
      const recent = new Date()
      recent.setDate(recent.getDate() - 5)
      const result = clampDateToRetention(recent)
      expect(result).toEqual(recent)
    })

    it('clamps to retention boundary when date is too old', () => {
      const old = new Date('2020-01-01')
      const result = clampDateToRetention(old)
      const expected = new Date()
      expected.setDate(expected.getDate() - 30)
      expected.setHours(0, 0, 0, 0)
      expect(result).toEqual(expected)
    })

    it('returns undefined for undefined input', () => {
      expect(clampDateToRetention(undefined)).toBeUndefined()
    })
  })

  describe('buildAuditLogWhere', () => {
    it('returns undefined for empty input', () => {
      const result = buildAuditLogWhere({})
      expect(result).toBeUndefined()
    })

    it('builds conditions for action and resourceType', () => {
      const result = buildAuditLogWhere({ action: 'login', resourceType: 'session' })
      expect(result).toBeDefined()
    })

    it('throws for invalid actorId', () => {
      expect(() => buildAuditLogWhere({ actorId: 'not-a-number' })).toThrow()
    })

    it('builds date range conditions', () => {
      const result = buildAuditLogWhere({ dateFrom: '2026-01-01', dateTo: '2026-01-31' })
      expect(result).toBeDefined()
    })
  })

  describe('toAuditLogItemDto', () => {
    it('maps a row to the item DTO', () => {
      const row = {
        id: 1,
        action: 'login',
        actorId: 42,
        actorRole: 'admin',
        resourceType: 'session',
        resourceId: 's1',
        details: { ip: '{E}192.168.1.1{/E}' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        createdAt: new Date('2026-05-20T12:00:00Z'),
      } as unknown as AuditLogRow

      const dto = toAuditLogItemDto(row, 'Alice')
      expect(dto.id).toBe('1')
      expect(dto.action).toBe('login')
      expect(dto.actorId).toBe('42')
      expect(dto.actorName).toBe('Alice')
      expect(dto.actorRole).toBe('admin')
      expect(dto.ipAddressMasked).toBe('192.168.x.x')
      expect(dto.userAgentMasked).toBe('Mozilla/5.0')
      expect(dto.details).toEqual({ ip: '***' })
    })

    it('handles null actorId and missing actorName', () => {
      const row = {
        id: 2,
        action: 'search',
        actorId: null,
        actorRole: null,
        resourceType: 'search',
        resourceId: null,
        details: null,
        ipAddress: null,
        userAgent: null,
        createdAt: new Date('2026-05-20T12:00:00Z'),
      } as unknown as AuditLogRow

      const dto = toAuditLogItemDto(row, null)
      expect(dto.actorId).toBeNull()
      expect(dto.actorName).toBeNull()
      expect(dto.ipAddressMasked).toBeNull()
    })
  })
})

describe('audit/controller router', () => {
  it('exportCsv route exists', () => {
    expect(auditLogRouter.exportCsv).toBeDefined()
  })

  it('list route exists', () => {
    expect(auditLogRouter.list).toBeDefined()
  })
})
