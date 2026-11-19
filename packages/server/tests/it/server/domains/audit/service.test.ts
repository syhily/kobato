import type { AuditContext } from '@kobato/server/domains/audit/types.ts'
import type { RequestFacts } from '@kobato/server/infra/http/request-facts.ts'

import { auditLog } from '@kobato/db/schema/config.ts'
import { user as userTable } from '@kobato/db/schema/user.ts'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle.ts'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher.ts'
import {
  buildAuditContext,
  recordAuditEvent,
  recordAuditEventFromContext,
} from '@kobato/server/domains/audit/services/record.ts'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry.ts'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@kobato/server/infra/logger.ts'
import { clearAllTables, getTestDb } from '@kobato/test/integration-db.ts'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()

function makeRequestFacts(overrides: Partial<RequestFacts> = {}): RequestFacts {
  return {
    analyticsEventId: '00000000-0000-4000-8000-0000000000af',
    path: '/',
    isDataRequest: false,
    userAgent: null,
    referer: null,
    acceptLanguage: null,
    purpose: null,
    cookie: null,
    clientHints: null,
    ...overrides,
  }
}

beforeEach(async () => {
  await clearAllTables(db)
  __clearLogCaptureForTests()
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
})

describe('audit/service', () => {
  describe('recordAuditEvent', () => {
    it('tags L3 fields and lands the row through the real batcher', async () => {
      initAllBatchers(getDatabaseHandle())

      recordAuditEvent({
        action: 'post_deleted',
        resourceType: 'post',
        resourceId: '1',
        details: { email: 'user@example.com', title: 'Hello' },
      })
      await flushAuditLog()

      const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'post_deleted'))
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        resourceType: 'post',
        resourceId: '1',
        details: { email: '{E}user@example.com{/E}', title: 'Hello' },
      })
    })

    it('swallows errors and logs them without throwing', async () => {
      expect(() => recordAuditEvent({ action: 'post_deleted', resourceType: 'post' })).not.toThrow()

      expect(__logCaptureForTests().some((e) => e.level === 'error')).toBe(true)
      expect(await db.select().from(auditLog)).toHaveLength(0)
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
    it('combines buildAuditContext and recordAuditEvent into one real row', async () => {
      initAllBatchers(getDatabaseHandle())

      const [actor] = await db
        .insert(userTable)
        .values({ name: 'Author', email: `author-${crypto.randomUUID()}@example.com`, password: 'p', role: 'author' })
        .returning({ id: userTable.id })

      const context = {
        viewer: { id: actor!.id, role: 'author' },
        clientAddress: '10.0.0.1',
        requestFacts: makeRequestFacts({ userAgent: 'Mozilla/5.0' }),
      } as unknown as AuditContext

      recordAuditEventFromContext(context, {
        action: 'post_published',
        resourceType: 'post',
        resourceId: '7',
      })
      await flushAuditLog()

      const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'post_published'))
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        actorId: actor!.id,
        actorRole: 'author',
        resourceType: 'post',
        resourceId: '7',
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
      })
    })
  })
})
