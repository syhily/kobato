import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeAuthedCtx } from '#/_helpers/mock-ctx'
import { getDatabaseHandle } from '@/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@/server/domains/audit/services/batcher'
import { adminUsersCrudRouter } from '@/server/http/controllers/admin/users-crud.controller'
import { initAllBatchers, resetAllBatchers } from '@/server/infra/db/batcher-registry'
import { auditLog } from '@/server/infra/db/schema/config'
import { user as userTable } from '@/server/infra/db/schema/user'

// The update procedure against the real engine: the patch projection,
// the safe-URL input schema, and the audit write are all exercised
// through seeded rows — no mocked operations layer.
const db = getTestDb()

beforeEach(async () => {
  await clearAllTables(db)
  initAllBatchers(getDatabaseHandle())
})

afterEach(() => {
  resetAllBatchers()
})

async function seedUser(opts: Partial<typeof userTable.$inferInsert> = {}): Promise<number> {
  const rows = await db
    .insert(userTable)
    .values({
      name: opts.name ?? 'Alice',
      email: opts.email ?? `alice-${Math.random().toString(36).slice(2)}@example.com`,
      password: 'hashed',
      role: opts.role ?? 'visitor',
      ...opts,
    })
    .returning({ id: userTable.id })
  return rows[0]!.id
}

async function userRow(id: number): Promise<typeof userTable.$inferSelect> {
  const rows = await db.select().from(userTable).where(eq(userTable.id, id))
  return rows[0]!
}

describe('admin users-crud controller', () => {
  describe('update', () => {
    it('accepts a valid HTTPS link and persists the patch', async () => {
      const id = await seedUser()

      const res = await call(
        adminUsersCrudRouter.update,
        { id: String(id), name: 'Alice', link: 'https://example.com' },
        { context: makeAuthedCtx({ role: 'admin', db }) },
      )

      expect(res).toEqual({ success: true })
      const row = await userRow(id)
      expect(row.name).toBe('Alice')
      expect(row.link).toBe('https://example.com')

      await flushAuditLog()
      const auditRows = await db.select().from(auditLog).where(eq(auditLog.action, 'user_updated'))
      expect(auditRows).toHaveLength(1)
      expect(auditRows[0]!.resourceId).toBe(String(id))
    })

    it('rejects a javascript: scheme link with a validation error', async () => {
      const id = await seedUser()

      await expect(
        call(
          adminUsersCrudRouter.update,
          { id: String(id), link: 'javascript:alert(1)' },
          {
            context: makeAuthedCtx({ role: 'admin', db }),
          },
        ),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

      expect((await userRow(id)).link).toBeNull()
    })

    it('patches only the fields present in the input', async () => {
      const id = await seedUser({ email: 'keep@example.com', link: 'https://keep.example.com' })

      const res = await call(
        adminUsersCrudRouter.update,
        { id: String(id), name: 'Alice' },
        { context: makeAuthedCtx({ role: 'admin', db }) },
      )

      expect(res).toEqual({ success: true })
      const row = await userRow(id)
      expect(row.name).toBe('Alice')
      expect(row.email).toBe('keep@example.com')
      expect(row.link).toBe('https://keep.example.com')
    })
  })
})
