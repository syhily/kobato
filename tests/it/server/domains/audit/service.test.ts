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

import { __clearLogCaptureForTests, __logCaptureForTests } from '@/server/infra/logger'

const pushAuditEvent = vi.fn()

vi.mock('@/server/domains/audit/services/batcher', () => ({ pushAuditEvent }))
const { recordAuditEvent, buildAuditContext, recordAuditEventFromContext } =
  await import('@/server/domains/audit/services/record')

describe('audit/service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __clearLogCaptureForTests()
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

      // The real logger, observed through the capture ring.
      expect(__logCaptureForTests().some((e) => e.level === 'error')).toBe(true)
    })
  })

  describe('buildAuditContext', () => {
    it('extracts actor, role, ip and ua from AuditContext', () => {
      const context = {
        viewer: { id: 1, role: 'admin' },
        clientAddress: '192.168.1.1',
        requestFacts: makeRequestFacts({ userAgent: 'TestBot/1.0' }),
      } as unknown as AuditContext

      const result = buildAuditContext(context)
      expect(result).toEqual({
        actorId: 1,
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
        viewer: { id: 42, role: 'author' },
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
      expect(call.actorId).toBe(42)
      expect(call.actorRole).toBe('author')
      expect(call.ipAddress).toBe('10.0.0.1')
      expect(call.userAgent).toBe('Mozilla/5.0')
    })
  })
})
