import type { Database } from '@kobato/db/database'
import type { Setting } from '@kobato/db/types'

import { sqliteOf } from '@kobato/db/database'
import { setting } from '@kobato/db/schema/config'
import { eq, like } from 'drizzle-orm'

export function findSettingByScope(db: Database, scope: string): Setting | null {
  const rows = sqliteOf(db).select().from(setting).where(eq(setting.scope, scope)).limit(1).all()
  return rows[0] ?? null
}

export function findSettingsByScopePrefix(db: Database, prefix: string): Setting[] {
  return sqliteOf(db)
    .select()
    .from(setting)
    .where(like(setting.scope, `${prefix}%`))
    .all()
}

export function upsertSetting(
  db: Database,
  data: Record<string, unknown>,
  updatedBy: number | null,
  scope: string,
): Setting {
  const now = new Date()
  const result = sqliteOf(db)
    .insert(setting)
    .values({
      scope,
      data,
      updatedAt: now,
      updatedBy,
    })
    .onConflictDoUpdate({
      target: setting.scope,
      set: { data, updatedAt: now, updatedBy },
    })
    .returning()
    .all()
  return result[0]
}

/**
 * Transactional setting read-modify-write: reads the stored row, hands it to the caller's PURE compute callback
 * (validation/merge/encryption — no persistence), and upserts the produced row in the SAME transaction. Errors the
 * callback throws propagate and roll the transaction back.
 */
export function updateSettingTransactionally(
  db: Database,
  scope: string,
  compute: (stored: Setting | null) => { data: Record<string, unknown>; updatedBy: number | null },
): void {
  return sqliteOf(db).transaction((tx) => {
    const storedRows = tx.select().from(setting).where(eq(setting.scope, scope)).limit(1).all()
    const stored = storedRows[0] ?? null
    const computed = compute(stored)
    const now = new Date()
    tx.insert(setting)
      .values({ scope, data: computed.data, updatedAt: now, updatedBy: computed.updatedBy })
      .onConflictDoUpdate({
        target: setting.scope,
        set: { data: computed.data, updatedAt: now, updatedBy: computed.updatedBy },
      })
      .run()
  })
}
