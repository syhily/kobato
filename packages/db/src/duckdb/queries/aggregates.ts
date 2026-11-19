import { blobColumns } from '@kobato/db/duckdb/access-events.ts'
import { sql } from 'kysely'

export const visitorsAggregate = sql<number>`COUNT(DISTINCT ${sql.ref(`access_events.${blobColumns.visitorHash}`)})`.as(
  'visitors',
)

const referersAggregate =
  sql<number>`COUNT(DISTINCT NULLIF(${sql.ref(`access_events.${blobColumns.refererHost}`)}, ${''}))`.as('referers')

export function visitAggregates(visitsAlias: string) {
  return [sql<number>`COUNT(*)`.as(visitsAlias), visitorsAggregate, referersAggregate]
}
