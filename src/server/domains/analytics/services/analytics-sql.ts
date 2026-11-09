import type { DuckDBConnection, DuckDBValue } from '@duckdb/node-api'
import type { Compilable } from 'kysely'

import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from 'kysely'

import type { DbOutcome } from '@/server/infra/trace/sanitize'

import { withSpanAsync } from '@/server/infra/trace/facade'
import { recordDbOperation } from '@/server/infra/trace/metrics'

/**
 * Kysely as a pure SQL compiler (Slite's design): the DummyDriver never
 * connects — Kysely builds the AST, a custom compiler emits DuckDB SQL
 * with identifiers stripped of quoting and whitelisted against a strict
 * pattern. User values travel ONLY as bound `?` parameters; execution
 * goes through the existing MVCC reader connection.
 */

export interface AnalyticsEventRow {
  event_id: string
  index1: string
  timestamp: string
  is_bot: boolean
  [column: string]: unknown
}

/** Sidecar row shape — only the join key is typed; dimensions are raw columns. */
export interface AnalyticsEnvRow {
  event_id: string
  [column: string]: unknown
}

export type AnalyticsDatabase = {
  access_events: AnalyticsEventRow
  device_env_client: AnalyticsEnvRow
}

// Identifiers are application-owned; user values must use bound parameters.
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

/** `access_events` INNER JOIN `device_env_client` — the env-dimension metric source. */
export function createEnvMetricQuery() {
  return createAnalyticsQuery().innerJoin('device_env_client', 'device_env_client.event_id', 'access_events.event_id')
}

export function compileAnalyticsQuery(query: Compilable) {
  return query.compile()
}

/** DuckDB MVCC reader connection. */
export type AnalyticsReader = DuckDBConnection

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

/**
 * Stable operation names for the analytics dashboard read boundary. Generated
 * SQL never becomes a telemetry label.
 */
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

/**
 * Compile + execute a read query on the reader connection, materializing
 * row objects. BigInt cells convert to Number when safe (analytics
 * counts never approach the unsafe range — out-of-range converts to
 * String rather than losing precision silently).
 *
 * This is THE analytics SQL execution boundary: the span/metric carry only
 * the caller's stable operation name — never SQL text or bound parameters.
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
        const compiled = compileAnalyticsQuery(query)
        const result = await reader.runAndReadAll(compiled.sql, toBoundParameters(compiled.parameters))
        span.setStatus('ok')
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
      },
    )
  } catch (error) {
    outcome = 'error'
    throw error
  } finally {
    recordDbOperation('duckdb', operation, performance.now() - startedAt, outcome)
  }
}
