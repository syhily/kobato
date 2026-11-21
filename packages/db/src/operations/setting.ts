import type { Database } from '@kobato/db/database'
import type { Setting } from '@kobato/db/types'

import { setting } from '@kobato/db/schema/config'
import { eq, like } from 'drizzle-orm'

export function findSettingByScope(db: Database, scope: string): Setting | null {
  const rows = db.select().from(setting).where(eq(setting.scope, scope)).limit(1).all()
  return rows[0] ?? null
}

export function findSettingsByScopePrefix(db: Database, prefix: string): Setting[] {
  return db
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
  const result = db
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
