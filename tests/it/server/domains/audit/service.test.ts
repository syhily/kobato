import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { AuditContext } from '@/server/domains/audit/types'
import type { RequestFacts } from '@/server/infra/http/request-facts'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import {
  buildAuditContext,
  recordAuditEvent,
  recordAuditEventFromContext,
} from '@/server/domains/audit/services/record'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { auditLog } from '@/server/infra/db/schema/config'
import { user as userTable } from '@/server/infra/db/schema/user'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@/server/infra/logger'

// The real write path: recordAuditEvent → tagL3InDetails → the real
// AuditLogBatcher → an `audit_log` row, asserted after an explicit flush
// (which also covers toRow's idFromString actor mapping). No mocks.
//
// The "swallows errors" case is the one deliberate inversion: it leaves
// the batcher UNINITIALIZED so the real `requireBatcher` throws and
// recordAuditEvent's catch swallows it — the failure mode the contract
// actually protects against.

const db = getTestDb()

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

beforeEach(async () => {
  await clearAllTables(db)
  __clearLogCaptureForTests()
})

afterEach(async () => {
  // Flush BEFORE dropping the batcher so no armed flush timer can insert
  // this case's stale events mid-next-test. flushAuditLog() is a no-op
  // when the case never initialized the batcher (the swallow case).
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
      // Batcher deliberately NOT initialized — the real requireBatcher
      // throws "not initialized" and recordAuditEvent's catch swallows it.
      expect(() => recordAuditEvent({ action: 'post_deleted', resourceType: 'post' })).not.toThrow()

      // The real logger, observed through the capture ring.
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

      // audit_log.actor_id is a real FK — the actor must exist.
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
