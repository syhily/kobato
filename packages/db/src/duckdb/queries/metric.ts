import type { AnalyticsReader } from '@kobato/db/duckdb/connection'
import type { MetricRow, MetricType, ResolvedAnalyticsQuery } from '@kobato/db/duckdb/queries/types'

import { visitorsAggregate } from '@kobato/db/duckdb/queries/aggregates'
import { METRIC_DIMENSIONS } from '@kobato/db/duckdb/queries/metric-dimensions'
import { buildAnalyticsFilter } from '@kobato/db/duckdb/queries/query-filter'
import {
  analyticsIdentifier,
  createAnalyticsQuery,
  createEnvMetricQuery,
  runAnalyticsQuery,
} from '@kobato/db/duckdb/query'
import { and, desc, sql } from 'drizzle-orm'

export async function queryMetric(
  reader: AnalyticsReader,
  input: ResolvedAnalyticsQuery,
  type: MetricType,
  limit = 20,
): Promise<MetricRow[]> {
  const dimension = METRIC_DIMENSIONS[type]
  const name =
    dimension.source === 'events'
      ? sql<string>`COALESCE(NULLIF(${analyticsIdentifier(`access_events.${dimension.column}`)}, ${''}), ${'(unknown)'})`
      : sql<string>`${dimension.select}`
  const selection = {
    name,
    visits: sql<number>`COUNT(*)`,
    visitors: visitorsAggregate,
  }
  const constraints = dimension.source === 'env' ? [sql<boolean>`${dimension.select} IS NOT NULL`] : []
  if (dimension.source === 'env' && dimension.require !== undefined) {
    constraints.push(dimension.require)
  }
  const where = and(buildAnalyticsFilter(input), ...constraints)
  const normalizedLimit = Math.max(0, Math.floor(limit))

  const rows =
    dimension.source === 'env'
      ? await runAnalyticsQuery(
          reader,
          createEnvMetricQuery(selection)
            .where(where)
            .groupBy(sql`name`)
            .orderBy(desc(sql`visits`))
            .limit(normalizedLimit),
          'metric_env',
        )
      : await runAnalyticsQuery(
          reader,
          createAnalyticsQuery(selection)
            .where(where)
            .groupBy(sql`name`)
            .orderBy(desc(sql`visits`))
            .limit(normalizedLimit),
          'metric',
        )
  return rows.map((row) => ({
    name: typeof row.name === 'string' ? row.name : '',
    visits: Number(row.visits),
    visitors: Number(row.visitors),
  }))
}
