import type { AnalyticsOperation, AnalyticsReader } from '@kobato/db/duckdb/query.ts'
import type { DbOutcome } from '@kobato/server/infra/trace/sanitize.ts'
import type { Compilable } from 'kysely'

import { executeAnalyticsQuery, setAnalyticsQueryExecutor } from '@kobato/db/duckdb/query.ts'
import { withSpanAsync } from '@kobato/server/infra/trace/facade.ts'
import { recordDbOperation } from '@kobato/server/infra/trace/metrics.ts'

/**
 * The server-owned half of the analytics SQL boundary: the span + metric wrap
 * around `@kobato/db`'s execution core (`db/duckdb/query.ts`). The trace facade
 * may not cross into `@kobato/db`, so the composition root installs THIS
 * executor through `wireAnalyticsQueryTelemetry` — every dashboard query then
 * carries the `db.duckdb.query` boundary with its stable operation name only
 * (never SQL text or bound parameters).
 */

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

/** Composition-root wiring: route `@kobato/db` dashboard queries through the traced executor. */
export function wireAnalyticsQueryTelemetry(): void {
  setAnalyticsQueryExecutor(runAnalyticsQuery)
}
