import { sql } from 'kysely'

import type { AnalyticsReader } from '@/server/domains/analytics/services/analytics-sql'
import type { MetricRow, MetricType, ResolvedAnalyticsQuery } from '@/shared/contracts/analytics'

import { createAnalyticsQuery, runAnalyticsQuery } from '@/server/domains/analytics/services/analytics-sql'
import { DIMENSION_COLUMN, buildAnalyticsFilter } from '@/server/domains/analytics/services/query-filter'

export async function queryMetric(
  reader: AnalyticsReader,
  input: ResolvedAnalyticsQuery,
  type: MetricType,
  limit = 20,
): Promise<MetricRow[]> {
  // `type` arrives already validated at the wire boundary (zod enum); the
  // column comes from the hard-coded DIMENSION_COLUMN map — never user input.
  const column = DIMENSION_COLUMN[type]
  const rows = await runAnalyticsQuery(
    reader,
    createAnalyticsQuery()
      .select([
        sql<string>`COALESCE(NULLIF(${sql.ref(column)}, ${''}), ${'(unknown)'})`.as('name'),
        sql<number>`COUNT(*)`.as('visits'),
        sql<number>`COUNT(DISTINCT ${sql.ref('blob5')})`.as('visitors'),
      ])
      .where(buildAnalyticsFilter(input))
      .groupBy('name')
      .orderBy('visits', 'desc')
      .limit(Math.max(0, Math.floor(limit))),
  )
  return rows.map((row) => ({
    name: typeof row.name === 'string' ? row.name : '',
    visits: Number(row.visits),
    visitors: Number(row.visitors),
  }))
}
