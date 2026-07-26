import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { clearAllTables } from '#/_helpers/integration-db'
import { archiveExpiredAuditLogs, cleanupExpiredArchives, runArchiveJob } from '@/server/domains/audit/services/archive'
import { flushAuditLog, pushAuditEvent } from '@/server/domains/audit/services/batcher'
import {
  buildAuditLogWhere,
  countAuditLogs,
  listAuditLogs,
  fetchAuditLogActorMap,
  fetchAuditLogActors,
} from '@/server/domains/audit/services/query'
import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { scheduleNextArchive, stopArchiveScheduler } from '@/server/domains/audit/services/scheduler'
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/services/test-utils'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { createDbPool, closePool } from '@/server/infra/db/pool'
import { auditLog } from '@/server/infra/db/schema/config'
import { user } from '@/server/infra/db/schema/user'

const poolManager = createDbPool()
const db: NodePgDatabase = poolManager.db
const pool: Pool = poolManager.pool

afterAll(async () => {
  await closePool(pool)
})

beforeEach(async () => {
  await clearAllTables(db)
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

afterEach(() => {
  resetAllBatchers()
  stopArchiveScheduler()
  vi.useRealTimers()
})

async function seedUser(role: 'admin' | 'visitor' = 'admin', name = 'T', email = 'a@example.com') {
  const [u] = await db.insert(user).values({ name, email, password: 'h', role }).returning()
  return u
}

async function seedAuditRow(
  overrides: Partial<{ action: string; resourceType: string; actorId: bigint; createdAt: Date }> = {},
) {
  const [row] = await db
    .insert(auditLog)
    .values({
      action: overrides.action ?? 'login',
      resourceType: overrides.resourceType ?? 'session',
      actorId: overrides.actorId ?? null,
      createdAt: overrides.createdAt ?? new Date(),
    })
    .returning()
  return row
}

describe('audit/repos/query — buildAuditLogWhere', () => {
  it('returns undefined when no filters are provided', () => {
    expect(buildAuditLogWhere({})).toBeUndefined()
  })

  it('combines multiple filter conditions into an AND chain', () => {
    const where = buildAuditLogWhere({ action: 'login', resourceType: 'session' })
    expect(where).toBeDefined()
  })

  it('clamps an over-old dateFrom to the retention boundary', () => {
    const where = buildAuditLogWhere({ dateFrom: '2020-01-01' })
    expect(where).toBeDefined()
  })

  it('extends dateTo to the start of the next day', () => {
    const where = buildAuditLogWhere({ dateTo: '2026-06-13' })
    expect(where).toBeDefined()
  })
})

describe('audit/repos/query — countAuditLogs', () => {
  it('counts all rows when no filters are provided', async () => {
    await seedAuditRow()
    await seedAuditRow({ action: 'logout' })
    expect(await countAuditLogs(db, {})).toBe(2)
  })

  it('counts rows matching the filter', async () => {
    await seedAuditRow({ action: 'login' })
    await seedAuditRow({ action: 'logout' })
    expect(await countAuditLogs(db, { action: 'login' })).toBe(1)
  })
})

describe('audit/repos/query — listAuditLogs', () => {
  it('returns rows in descending createdAt order with offset/limit', async () => {
    const older = await seedAuditRow({ createdAt: new Date('2026-01-01T00:00:00Z') })
    const newer = await seedAuditRow({ createdAt: new Date('2026-06-01T00:00:00Z') })
    const rows = await listAuditLogs(db, {}, 0, 10)
    expect(rows[0]!.id).toBe(newer.id)
    expect(rows[1]!.id).toBe(older.id)
  })

  it('honors the offset', async () => {
    await seedAuditRow({ createdAt: new Date('2026-01-01T00:00:00Z') })
    await seedAuditRow({ createdAt: new Date('2026-06-01T00:00:00Z') })
    const rows = await listAuditLogs(db, {}, 1, 10)
    expect(rows).toHaveLength(1)
  })
})

describe('audit/repos/query — fetchAuditLogActorMap', () => {
  it('returns an empty map when no rows have an actorId', async () => {
    await seedAuditRow()
    const rows = await db.select().from(auditLog)
    expect(await fetchAuditLogActorMap(db, rows)).toEqual(new Map())
  })

  it('maps actorId string → user name', async () => {
    const u = await seedUser('admin', 'Alice', 'alice@example.com')
    await seedAuditRow({ actorId: u.id })
    const rows = await db.select().from(auditLog)
    const map = await fetchAuditLogActorMap(db, rows)
    expect(map.get(String(u.id))).toBe('Alice')
  })
})

describe('audit/repos/query — fetchAuditLogActors', () => {
  it('returns an empty list when no audit rows exist', async () => {
    expect(await fetchAuditLogActors(db)).toEqual([])
  })

  it('returns distinct actors ordered by name', async () => {
    const bob = await seedUser('admin', 'Bob', 'bob@example.com')
    const alice = await seedUser('admin', 'Alice', 'alice@example.com')
    await seedAuditRow({ actorId: bob.id })
    await seedAuditRow({ actorId: alice.id })
    const actors = await fetchAuditLogActors(db)
    expect(actors).toHaveLength(2)
    expect(actors[0]!.name).toBe('Alice')
  })
})

describe('audit/repos/batcher — flushAuditLog', () => {
  it('returns zeros when the batcher is not initialized', async () => {
    resetAllBatchers()
    expect(await flushAuditLog()).toEqual({ committed: 0, deadLettered: 0 })
  })

  it('pushAuditEvent throws when the batcher is not initialized', () => {
    resetAllBatchers()
    expect(() => pushAuditEvent({ action: 'login', resourceType: 'session' })).toThrow(/initialized/)
  })

  it('flushes pushed events via COPY and writes them to the audit_log table', async () => {
    initAllBatchers(pool, db)
    pushAuditEvent({ action: 'login', resourceType: 'session' })
    pushAuditEvent({ action: 'logout', resourceType: 'session' })
    const result = await flushAuditLog()
    expect(result.committed).toBe(2)
    const rows = await db.select().from(auditLog).orderBy(auditLog.id)
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.action).sort()).toEqual(['login', 'logout'])
  })
})

describe('audit/services/record — recordAuditEvent', () => {
  it('is a no-op when the batcher is not initialized (does not throw)', () => {
    resetAllBatchers()
    expect(() => recordAuditEvent({ action: 'login', resourceType: 'session' })).not.toThrow()
  })

  it('routes the event into the batcher when initialized', async () => {
    const u = await seedUser('admin', 'Recorder', 'recorder@example.com')
    initAllBatchers(pool, db)
    recordAuditEvent({
      action: 'login',
      resourceType: 'session',
      resourceId: 'sid-1',
      actorId: u.id,
      actorRole: 'admin',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
    })
    const result = await flushAuditLog()
    expect(result.committed).toBe(1)
    const rows = await db.select().from(auditLog)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceId).toBe('sid-1')
  })
})

describe('audit/services/archive — purge-only mode (no S3)', () => {
  it('deletes expired rows and returns deletedRows count', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
        storage: { ...TEST_BLOG_SETTINGS_BUNDLE.assets!.storage, enabled: false, secretAccessKey: '' },
      },
      limits: { ...TEST_BLOG_SETTINGS_BUNDLE.limits!, auditLogDbRetentionDays: 1 },
    })
    await seedAuditRow({ createdAt: new Date('2020-01-01T00:00:00Z') })
    await seedAuditRow({ createdAt: new Date() })
    const result = await archiveExpiredAuditLogs(db)
    expect(result.archivedDays).toBe(0)
    expect(result.deletedRows).toBeGreaterThanOrEqual(1)
  })

  it('returns zeroes when nothing is older than the cutoff', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
        storage: { ...TEST_BLOG_SETTINGS_BUNDLE.assets!.storage, enabled: false, secretAccessKey: '' },
      },
    })
    await seedAuditRow({ createdAt: new Date() })
    const result = await archiveExpiredAuditLogs(db)
    expect(result).toEqual({ archivedDays: 0, archivedRows: 0, deletedRows: 0 })
  })
})

describe('audit/services/archive — cleanupExpiredArchives', () => {
  it('returns deletedFiles=0 when S3 is unavailable', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
        storage: { ...TEST_BLOG_SETTINGS_BUNDLE.assets!.storage, enabled: false, secretAccessKey: '' },
      },
    })
    const result = await cleanupExpiredArchives()
    expect(result).toEqual({ deletedFiles: 0 })
  })
})

describe('audit/services/archive — runArchiveJob', () => {
  it('runs end-to-end in purge-only mode without throwing', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      assets: {
        ...TEST_BLOG_SETTINGS_BUNDLE.assets!,
        storage: { ...TEST_BLOG_SETTINGS_BUNDLE.assets!.storage, enabled: false, secretAccessKey: '' },
      },
    })
    await expect(runArchiveJob(db)).resolves.toBeUndefined()
  })
})

describe('audit/services/scheduler — scheduleNextArchive', () => {
  it('retries every 30s when settings are not hydrated', () => {
    vi.useFakeTimers()
    setBlogSettingsBundleForTests(null)
    scheduleNextArchive()
    expect(vi.getTimerCount()).toBeGreaterThan(0)
  })

  it('schedules the next run when settings are hydrated', () => {
    vi.useFakeTimers()
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    scheduleNextArchive()
    expect(vi.getTimerCount()).toBeGreaterThan(0)
  })

  it('stopArchiveScheduler clears the pending timer', () => {
    vi.useFakeTimers()
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    scheduleNextArchive()
    stopArchiveScheduler()
    expect(vi.getTimerCount()).toBe(0)
  })
})
