// Post-shutdown DuckDB verification: open the analytics sidecar AFTER the
// server stopped (its close checkpoints the WAL) and prove page views landed
// as access_events rows.

import { DuckDBInstance } from '@duckdb/node-api'
import { isRecord } from '@kobato/utils/type-guards.ts'

export async function scanAccessEvents(analyticsPath: string): Promise<{ rows: number; paths: number }> {
  const instance = await DuckDBInstance.create(analyticsPath)
  try {
    const connection = await instance.connect()
    const result = await connection.runAndReadAll(
      'SELECT count(*) AS rows, count(DISTINCT blob1) AS paths FROM access_events',
    )
    const row: unknown = result.getRowObjects()[0]
    connection.closeSync()
    const cell = (key: string): number =>
      isRecord(row) && (typeof row[key] === 'number' || typeof row[key] === 'bigint') ? Number(row[key]) : 0
    return { rows: cell('rows'), paths: cell('paths') }
  } finally {
    instance.closeSync()
  }
}
