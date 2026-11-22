import { DuckDBInstance } from '@duckdb/node-api'

export async function runDuckDbSelfCheck(): Promise<void> {
  const instance = await DuckDBInstance.create()
  const connection = await instance.connect()
  try {
    await connection.run('CREATE TABLE self_check (n INTEGER)')
    await connection.run('INSERT INTO self_check VALUES (1), (2), (3)')
    const result = await connection.runAndReadAll('SELECT sum(n) AS total FROM self_check')
    const total = result.getRowObjects()[0]?.total
    if (Number(total) !== 6) {
      throw new Error(`DuckDB self-check aggregate returned ${String(total)}, expected 6`)
    }
  } finally {
    connection.closeSync()
    instance.closeSync()
  }
}
