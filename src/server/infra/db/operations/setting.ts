import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { eq, like } from 'drizzle-orm'

import type { Setting } from '@/server/infra/db/types'

import { setting } from '@/server/infra/db/schema/config'

export async function findSettingByScope(db: NodePgDatabase, scope: string): Promise<Setting | null> {
  const rows = await db.select().from(setting).where(eq(setting.scope, scope)).limit(1)
  return rows[0] ?? null
}

/**
 * Pull every settings row whose `scope` starts with `prefix`. Used by
 * `hydrateBlogSettings()` to load all section rows in one round-trip
 * before bucketing them by `scope` into `BlogSettingsBundle`. The
 * caller is expected to filter / parse the returned rows.
 */
export async function findSettingsByScopePrefix(db: NodePgDatabase, prefix: string): Promise<Setting[]> {
  // `like` with a `%` suffix scans the unique B-tree on `scope`; no
  // sequential scan even for large `setting` tables. The prefix is
  // hard-coded by the caller (`'blog.'`) so SQL injection isn't a
  // concern.
  return db
    .select()
    .from(setting)
    .where(like(setting.scope, `${prefix}%`))
}

export async function upsertSetting(
  db: NodePgDatabase,
  data: Record<string, unknown>,
  updatedBy: bigint | null,
  scope: string,
): Promise<Setting> {
  const now = new Date()
  const result = await db
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
  return result[0]
}
