import type { AnalyticsOperation, AnalyticsReader } from '@kobato/db/duckdb/query'
import type { DbOutcome } from '@kobato/server/infra/trace/sanitize'
import type { Compilable } from 'kysely'

import { executeAnalyticsQuery, setAnalyticsQueryExecutor } from '@kobato/db/duckdb/query'
import { withSpanAsync } from '@kobato/server/infra/trace/facade'
import { recordDbOperation } from '@kobato/server/infra/trace/metrics'

export async function runAnalyticsQuery(
  reader: AnalyticsReader,
  query: Compilable,
  operation: AnalyticsOperation,
): Promise<Record<string, unknown>[]> {
  const startedAt = performance.now()
  let outcome: DbOutcome = 'success'
  try {
    return await withSpanAsync(
      'db.duckdb.query',
      { attributes: { 'db.engine': 'duckdb', 'db.operation': operation } },
      async (span) => {
        const rows = await executeAnalyticsQuery(reader, query)
        span.setStatus('ok')
        return rows
      },
    )
  } catch (error) {
    outcome = 'error'
    throw error
  } finally {
    recordDbOperation('duckdb', operation, performance.now() - startedAt, outcome)
  }
}

export function wireAnalyticsQueryTelemetry(): void {
  setAnalyticsQueryExecutor(runAnalyticsQuery)
}
