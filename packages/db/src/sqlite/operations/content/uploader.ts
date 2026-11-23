import type { Database } from '@kobato/db/sqlite/database'
import type { SelectedFields, SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { user } from '@kobato/db/sqlite/schema/user'
import { eq } from 'drizzle-orm'

export function withUploader<TColumns extends SelectedFields>(options: {
  table: SQLiteTable
  idColumn: SQLiteColumn
  uploaderIdColumn: SQLiteColumn
  columns: TColumns
}) {
  const columns = { ...options.columns, uploaderName: user.name } as const

  function selectJoined(db: Database) {
    return sqliteOf(db).select(columns).from(options.table).leftJoin(user, eq(user.id, options.uploaderIdColumn))
  }

  async function findJoinedRowById(db: Database, id: number) {
    const rows = await selectJoined(db).where(eq(options.idColumn, id)).limit(1)
    return rows[0] ?? null
  }

  async function updateThenRefetch<TUpdated>(
    db: Database,
    id: number,
    update: (db: Database, id: number) => Promise<TUpdated | null>,
  ) {
    const updated = await update(db, id)
    if (updated === null) {
      return null
    }
    return findJoinedRowById(db, id)
  }

  return { columns, selectJoined, findJoinedRowById, updateThenRefetch }
}
