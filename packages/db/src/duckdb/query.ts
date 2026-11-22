import type { DuckDBValue } from '@duckdb/node-api'
import type { AnalyticsQuery, AnalyticsReader } from '@kobato/db/duckdb/connection'
import type { Compilable } from 'kysely'

import { analyticsQueryOf, compilableQuery, readerConnection } from '@kobato/db/duckdb/connection'
import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from 'kysely'

export interface AnalyticsEventRow {
  event_id: string
  index1: string
  timestamp: string
  is_bot: boolean
  [column: string]: unknown
}

export interface AnalyticsEnvRow {
  event_id: string
  [column: string]: unknown
}

export type AnalyticsDatabase = {
  access_events: AnalyticsEventRow
  device_env_client: AnalyticsEnvRow
}

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/

class AnalyticsQueryCompiler extends MysqlQueryCompiler {
  protected override getLeftIdentifierWrapper(): string {
    return ''
  }

  protected override getRightIdentifierWrapper(): string {
    return ''
  }

  protected override sanitizeIdentifier(identifier: string): string {
    if (!identifierPattern.test(identifier)) {
      throw new Error(`Invalid Analytics identifier: ${identifier}`)
    }
    return identifier
  }
}

const coldDb = new Kysely<AnalyticsDatabase>({
  dialect: {
    createAdapter: () => new MysqlAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new MysqlIntrospector(db),
    createQueryCompiler: () => new AnalyticsQueryCompiler(),
  },
})

export function createAnalyticsQuery() {
  return coldDb.selectFrom('access_events')
}

export function createEnvMetricQuery() {
  return createAnalyticsQuery().innerJoin('device_env_client', 'device_env_client.event_id', 'access_events.event_id')
}

export function compileAnalyticsQuery(query: Compilable) {
  return query.compile()
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
  const result = await readerConnection(reader).runAndReadAll(compiled.sql, toBoundParameters(compiled.parameters))
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
  query: Compilable,
  operation: AnalyticsOperation,
): Promise<Record<string, unknown>[]> {
  const token = analyticsQueryOf(query)
  if (executor !== null) {
    return executor(reader, token, operation)
  }
  return executeAnalyticsQuery(reader, token)
}
