import { blobColumns } from '@kobato/db/duckdb/access-events'
import { analyticsIdentifier } from '@kobato/db/duckdb/query'
import { sql } from 'drizzle-orm'

export const visitorsAggregate = sql<number>`COUNT(DISTINCT ${analyticsIdentifier(`access_events.${blobColumns.visitorHash}`)})`

const referersAggregate = sql<number>`COUNT(DISTINCT NULLIF(${analyticsIdentifier(`access_events.${blobColumns.refererHost}`)}, ${''}))`

export function visitAggregates(visitsAlias: string) {
  return {
    [visitsAlias]: sql<number>`COUNT(*)`,
    visitors: visitorsAggregate,
    referers: referersAggregate,
  }
}
