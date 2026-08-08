import { eq, like } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { Setting } from '@/server/infra/db/types'

import { setting } from '@/server/infra/db/schema/config'

// Sync (node:sqlite): called inside the settings-save transaction.
export function findSettingByScope(db: Database, scope: string): Setting | null {
  const rows = db.select().from(setting).where(eq(setting.scope, scope)).limit(1).all()
  return rows[0] ?? null
}

/** All settings rows whose `scope` starts with `prefix`; the caller filters/parses them. */
// Sync (node:sqlite): called inside the hydration read path.
export function findSettingsByScopePrefix(db: Database, prefix: string): Setting[] {
  // `%`-suffixed LIKE still uses the unique B-tree on `scope`; the prefix is caller-hard-coded.
  return db
    .select()
    .from(setting)
    .where(like(setting.scope, `${prefix}%`))
    .all()
}

// Sync (node:sqlite): called inside transactions (install, settings save).
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
