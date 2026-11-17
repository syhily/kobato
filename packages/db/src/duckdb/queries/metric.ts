import type { MetricRow, MetricType, ResolvedAnalyticsQuery } from '@kobato/contracts/analytics.ts'
import type { AnalyticsDatabase, AnalyticsReader } from '@kobato/db/duckdb/query.ts'

import { visitorsAggregate } from '@kobato/db/duckdb/queries/aggregates.ts'
import { METRIC_DIMENSIONS } from '@kobato/db/duckdb/queries/metric-dimensions.ts'
import { buildAnalyticsFilter } from '@kobato/db/duckdb/queries/query-filter.ts'
import { createAnalyticsQuery, createEnvMetricQuery, runAnalyticsQuery } from '@kobato/db/duckdb/query.ts'
import { sql, type SelectQueryBuilder } from 'kysely'

/**
 * Apply the shared WHERE predicate plus the dimension's own display
 * expression and bucket guards. Blob dimensions keep the `(unknown)` bucket;
 * environment dimensions drop rows whose bucket expression is NULL (no
 * static block / not reported) instead of inventing an empty bucket.
 */
function shapeMetricQuery<TB extends keyof AnalyticsDatabase>(
  query: SelectQueryBuilder<AnalyticsDatabase, TB, Record<string, unknown>>,
  input: ResolvedAnalyticsQuery,
  type: MetricType,
  limit: number,
): SelectQueryBuilder<AnalyticsDatabase, TB, Record<string, unknown>> {
  const dimension = METRIC_DIMENSIONS[type]
  const name =
    dimension.source === 'events'
      ? sql<string>`COALESCE(NULLIF(${sql.ref(`access_events.${dimension.column}`)}, ${''}), ${'(unknown)'})`
      : sql<string>`${dimension.select}`

  const constraints = dimension.source === 'env' ? [sql<boolean>`${dimension.select} IS NOT NULL`] : []
  if (dimension.source === 'env' && dimension.require !== undefined) {
    constraints.push(dimension.require)
  }

  return query
    .select([name.as('name'), sql<number>`COUNT(*)`.as('visits'), visitorsAggregate])
    .where(buildAnalyticsFilter(input))
    .$if(constraints.length > 0, (qb) => qb.where(sql<boolean>`${sql.join(constraints, sql` and `)}`))
    .groupBy('name')
    .orderBy('visits', 'desc')
    .limit(Math.max(0, Math.floor(limit)))
}

export async function queryMetric(
  reader: AnalyticsReader,
  input: ResolvedAnalyticsQuery,
  type: MetricType,
  limit = 20,
): Promise<MetricRow[]> {
  // `type` arrives already validated at the wire boundary (zod enum); the SQL
  // expressions come from the hard-coded METRIC_DIMENSIONS registry — never user
  // input. Env dimensions need the sidecar joined in (blob dimensions must not,
  // or beacon-less events would disappear).
  const dimension = METRIC_DIMENSIONS[type]
  const rows =
    dimension.source === 'env'
      ? await runAnalyticsQuery(reader, shapeMetricQuery(createEnvMetricQuery(), input, type, limit), 'metric_env')
      : await runAnalyticsQuery(reader, shapeMetricQuery(createAnalyticsQuery(), input, type, limit), 'metric')
  return rows.map((row) => ({
    name: typeof row.name === 'string' ? row.name : '',
    visits: Number(row.visits),
    visitors: Number(row.visitors),
  }))
}
