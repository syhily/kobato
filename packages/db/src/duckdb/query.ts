import type { DuckDBValue } from '@duckdb/node-api'
import type { AnalyticsCompilable, AnalyticsQuery, AnalyticsReader } from '@kobato/db/duckdb/connection'
import type { SQL } from 'drizzle-orm'
import type { SelectedFields } from 'drizzle-orm/pg-core/query-builders/select.types'

import { DuckDBDialect, DuckDBSelectBuilder } from '@duckdbfan/drizzle-duckdb'
import { analyticsQueryOf, compilableQuery, readerConnection } from '@kobato/db/duckdb/connection'
import { accessEvents, deviceEnvClient } from '@kobato/db/duckdb/schema'
import { eq, sql } from 'drizzle-orm'

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/
const analyticsDialect = new DuckDBDialect()

export function analyticsIdentifier(identifier: string): SQL {
  if (!identifierPattern.test(identifier)) {
    throw new Error(`Invalid Analytics identifier: ${identifier}`)
  }
  return sql.raw(identifier)
}

export function createAnalyticsQuery(fields?: SelectedFields) {
  return new DuckDBSelectBuilder({ fields, session: undefined, dialect: analyticsDialect }).from(accessEvents)
}

export function createEnvMetricQuery(fields?: SelectedFields) {
  return createAnalyticsQuery(fields).innerJoin(deviceEnvClient, eq(deviceEnvClient.eventId, accessEvents.eventId))
}

export function compileAnalyticsQuery(query: AnalyticsCompilable) {
  return query.toSQL()
}

function toBoundParameters(parameters: readonly unknown[]): DuckDBValue[] {
  return parameters.map((value) => {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return value
    }
    throw new TypeError('Unsupported analytics parameter')
  })
}

export const ANALYTICS_OPERATIONS = [
  'views',
  'heatmap',
  'counters',
  'metric',
  'metric_env',
  'realtime',
  'export',
] as const
export type AnalyticsOperation = (typeof ANALYTICS_OPERATIONS)[number]

export type AnalyticsQueryExecutor = (
  reader: AnalyticsReader,
  query: AnalyticsQuery,
  operation: AnalyticsOperation,
) => Promise<Record<string, unknown>[]>

let executor: AnalyticsQueryExecutor | null = null

export function setAnalyticsQueryExecutor(next: AnalyticsQueryExecutor | null): void {
  executor = next
}

export async function executeAnalyticsQuery(
  reader: AnalyticsReader,
  query: AnalyticsQuery,
): Promise<Record<string, unknown>[]> {
  const compiled = compileAnalyticsQuery(compilableQuery(query))
  const result = await readerConnection(reader).runAndReadAll(compiled.sql, toBoundParameters(compiled.params))
  return result
    .getRowObjects()
    .map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          typeof value === 'bigint'
            ? value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
              ? Number(value)
              : String(value)
            : value,
        ]),
      ),
    )
}

export async function runAnalyticsQuery(
  reader: AnalyticsReader,
  query: AnalyticsCompilable,
  operation: AnalyticsOperation,
): Promise<Record<string, unknown>[]> {
  const token = analyticsQueryOf(query)
  if (executor !== null) {
    return executor(reader, token, operation)
  }
  return executeAnalyticsQuery(reader, token)
}
