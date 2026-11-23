import { sqliteOf } from '@kobato/db/sqlite/database'
import { upsertSetting } from '@kobato/db/sqlite/operations/system/setting'
import { auditLog } from '@kobato/db/sqlite/schema/config'
import { user } from '@kobato/db/sqlite/schema/user'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { adminBrandingRouter } from '@kobato/server/http/controllers/admin/branding.controller'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@kobato/server/infra/storage/registry'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { makeMemoryBackend } from '@kobato/server/tests/utils/memory-storage'
import { makeAuthedCtx } from '@kobato/server/tests/utils/mock-ctx'
import { SECTION_REGISTRY } from '@kobato/settings/sections/registry'
import { call, ORPCError } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const mem = makeMemoryBackend()
const db = getTestDb()
const ASSETS_SCOPE = SECTION_REGISTRY.assets.scope

function seedAssetsRow(): void {
  const base = {
    asset: { host: 'cdn.example.com', scheme: 'https' },
    storage: {
      enabled: true,
      endpoint: 'https://s3.example.com',
      region: 'auto',
      bucket: 'b',
      accessKeyId: 'k',
      secretAccessKey: 's',
      forcePathStyle: false,
      urlTemplate: '',
    },
    upload: { maxBytes: 8 * 1024 * 1024, jpegQuality: 82 },
  }
  upsertSetting(db, base, null, ASSETS_SCOPE)
}

async function seedAdmin(): Promise<number> {
  const [row] = await sqliteOf(db)
    .insert(user)
    .values({ name: 'Admin', email: 'admin@example.com', password: 'hashed', role: 'admin' })
    .returning({ id: user.id })
  return row.id
}

beforeEach(async () => {
  __setStorageBackendForTests('s3', mem.backend)
  initAllBatchers(getDatabaseHandle())
  await clearAllTables(db)
  seedAssetsRow()
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
  __resetStorageBackendsForTests()
  mem.reset()
})

describe('adminBrandingRouter.clear', () => {
  it('clears a valid slot, audits branding_cleared, and answers the cleared slot', async () => {
    const admin = await seedAdmin()
    const res = await call(adminBrandingRouter.clear, { slot: 'logoSvg' }, { context: makeAuthedCtx({ db }) })
    expect(res).toEqual({ slot: 'logoSvg', success: true })

    await flushAuditLog()
    const rows = await sqliteOf(db).select().from(auditLog).where(eq(auditLog.action, 'branding_cleared'))
    expect(rows).toHaveLength(1)
    expect(rows[0].resourceType).toBe('branding')
    expect(rows[0].resourceId).toBe('logoSvg')
    expect(rows[0].actorId).toBe(admin)
  })

  it('rejects an unknown slot as 400 branding.error.unknownSlot without auditing', async () => {
    await seedAdmin()
    await expect(
      call(adminBrandingRouter.clear, { slot: 'nope' }, { context: makeAuthedCtx({ db }) }),
    ).rejects.toMatchObject({
      status: 400,
      data: { descriptor: { messageKey: 'branding.error.unknownSlot' } },
    })

    await flushAuditLog()
    const rows = await sqliteOf(db).select().from(auditLog).where(eq(auditLog.action, 'branding_cleared'))
    expect(rows).toHaveLength(0)
  })

  it('is admin-only — an author is FORBIDDEN', async () => {
    await seedAdmin()
    await expect(
      call(adminBrandingRouter.clear, { slot: 'logoSvg' }, { context: makeAuthedCtx({ role: 'author', db }) }),
    ).rejects.toBeInstanceOf(ORPCError)
  })
})
