import { sql } from 'kysely'

/**
 * The three shared visit aggregates — row count, distinct visitors (blob5,
 * the daily-salted hash), distinct referer hosts (non-empty blob3). The
 * counters and export queries MUST count the same thing; both select from
 * this single construction.
 */
export function visitAggregates(visitsAlias: string) {
  return [
    sql<number>`COUNT(*)`.as(visitsAlias),
    sql<number>`COUNT(DISTINCT ${sql.ref('blob5')})`.as('visitors'),
    sql<number>`COUNT(DISTINCT NULLIF(${sql.ref('blob3')}, ${''}))`.as('referers'),
  ]
}
