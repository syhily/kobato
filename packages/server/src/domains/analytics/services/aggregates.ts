import { sql } from 'kysely'

/**
 * The three shared visit aggregates: row count, distinct daily-salted visitors
 * (blob5), distinct non-empty referer hosts (blob3). Counters and export MUST
 * both select from this so they count the same thing.
 */
export function visitAggregates(visitsAlias: string) {
  return [
    sql<number>`COUNT(*)`.as(visitsAlias),
    sql<number>`COUNT(DISTINCT ${sql.ref('blob5')})`.as('visitors'),
    sql<number>`COUNT(DISTINCT NULLIF(${sql.ref('blob3')}, ${''}))`.as('referers'),
  ]
}
