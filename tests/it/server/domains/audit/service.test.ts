import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuditContext } from '@/server/domains/audit/types'
import type { RequestFacts } from '@/server/infra/http/request-facts'

function makeRequestFacts(overrides: Partial<RequestFacts> = {}): RequestFacts {
  return {
    path: '/',
    isDataRequest: false,
    userAgent: null,
    referer: null,
    acceptLanguage: null,
    purpose: null,
    cookie: null,
    ...overrides,
  }
}

const pushAuditEvent = vi.fn()
const loggerMock = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
const getLogger = vi.fn(() => loggerMock)

vi.mock('@/server/domains/audit/services/batcher', () => ({ pushAuditEvent }))
vi.mock('@/server/infra/logger', () => ({
  getLogger,
  L3_KEYS: new Set([
    'email',
    'ip',
    'clientAddress',
    'remoteAddress',
    'userAgent',
    'phone',
    'authorEmail',
    'authorIp',
    'cookie',
    'deviceId',
    'name',
  ]),
}))

const { recordAuditEvent, buildAuditContext, recordAuditEventFromContext } =
  await import('@/server/domains/audit/services/record')

describe('audit/service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('recordAuditEvent', () => {
    it('tags L3 fields and pushes to batcher', () => {
      recordAuditEvent({
        action: 'post_deleted',
        resourceType: 'post',
        resourceId: '1',
        details: { email: 'user@example.com', title: 'Hello' },
      })

      expect(pushAuditEvent).toHaveBeenCalledOnce()
      const call = pushAuditEvent.mock.calls[0][0]
      expect(call.action).toBe('post_deleted')
      expect(call.details).toEqual({ email: '{E}user@example.com{/E}', title: 'Hello' })
    })

    it('swallows errors and logs them without throwing', () => {
      pushAuditEvent.mockImplementationOnce(() => {
        throw new Error('batcher full')
      })

      expect(() => recordAuditEvent({ action: 'post_deleted', resourceType: 'post' })).not.toThrow()

      expect(getLogger().error).toHaveBeenCalled()
    })
  })

  describe('buildAuditContext', () => {
    it('extracts actor, role, ip and ua from AuditContext', () => {
      const context = {
        viewer: { id: 1n, role: 'admin' },
        clientAddress: '192.168.1.1',
        requestFacts: makeRequestFacts({ userAgent: 'TestBot/1.0' }),
      } as unknown as AuditContext

      const result = buildAuditContext(context)
      expect(result).toEqual({
        actorId: 1n,
        actorRole: 'admin',
        ipAddress: '192.168.1.1',
        userAgent: 'TestBot/1.0',
      })
    })

    it('falls back to null for missing viewer or headers', () => {
      const context = {
        viewer: null,
        clientAddress: '192.168.1.1',
        requestFacts: makeRequestFacts(),
      } as unknown as AuditContext

      const result = buildAuditContext(context)
      expect(result).toEqual({
        actorId: undefined,
        actorRole: null,
        ipAddress: '192.168.1.1',
        userAgent: null,
      })
    })
  })

  describe('recordAuditEventFromContext', () => {
    it('combines buildAuditContext and recordAuditEvent', () => {
      const context = {
        viewer: { id: 42n, role: 'author' },
        clientAddress: '10.0.0.1',
        requestFacts: makeRequestFacts({ userAgent: 'Mozilla/5.0' }),
      } as unknown as AuditContext

      recordAuditEventFromContext(context, {
        action: 'post_published',
        resourceType: 'post',
        resourceId: '7',
      })

      expect(pushAuditEvent).toHaveBeenCalledOnce()
      const call = pushAuditEvent.mock.calls[0][0]
      expect(call.action).toBe('post_published')
      expect(call.actorId).toBe(42n)
      expect(call.actorRole).toBe('author')
      expect(call.ipAddress).toBe('10.0.0.1')
      expect(call.userAgent).toBe('Mozilla/5.0')
    })
  })
})
