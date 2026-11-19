// Trace-only `sqlite.db.query` subscriber.
//
// Deliberately independent of `infra/db/query-diagnostics.ts`: tracing must not
// require the debug log level, and the debug subscriber's redaction rules are
// not the trace privacy contract.
//
// The diagnostics channel publishes AFTER a statement completes and only for
// successful statements, with `duration` in nanoseconds. The span therefore gets
// an explicit start/end derived from that duration, and exists only when a
// request/job span is already active — a boot-time migration or a timer flush
// without an active span produces nothing.

import { isVitest } from '@kobato/server/infra/config.ts'
import { redactBoundValues } from '@kobato/server/infra/db/query-diagnostics.ts'
import { activeTraceIds, isTraceActive, startSpan } from '@kobato/server/infra/trace/facade.ts'
import { recordDbOperation } from '@kobato/server/infra/trace/metrics.ts'
import { isRecord } from '@kobato/utils/type-guards.ts'
import diagnostics_channel from 'node:diagnostics_channel'

const SQLITE_QUERY_CHANNEL = 'sqlite.db.query'

/** Expanded SQL is never exported; only this bounded redacted form is. */
const MAX_STATEMENT_LENGTH = 512

const SQL_OPERATIONS: ReadonlySet<string> = new Set([
  'select',
  'insert',
  'update',
  'delete',
  'replace',
  'with',
  'create',
  'drop',
  'alter',
  'pragma',
  'begin',
  'commit',
  'rollback',
  'savepoint',
  'release',
  'attach',
  'detach',
  'analyze',
  'vacuum',
  'explain',
  'reindex',
  'set',
])

interface SubscriptionState {
  includeRedactedSql: boolean
}

export interface SqliteTraceOptions {
  includeRedactedSql?: boolean
  /** Vitest never subscribes implicitly; a test must opt in. */
  enabledInTests?: boolean
}

let subscribed = false
let state: SubscriptionState | null = null

/** First keyword → a fixed operation label; never echoes the SQL. */
export function sqlOperation(sql: string): string {
  const match = /^\s*([A-Za-z]+)/.exec(sql)
  const keyword = match?.[1]?.toLowerCase()
  if (keyword === undefined) {
    return 'other'
  }
  return SQL_OPERATIONS.has(keyword) ? keyword : 'other'
}

function onQuery(message: unknown): void {
  try {
    if (state === null || !isTraceActive() || activeTraceIds() === null) {
      return
    }
    if (!isRecord(message) || typeof message.sql !== 'string' || typeof message.duration !== 'number') {
      return
    }

    const durationMs = Number.isFinite(message.duration) ? Math.max(0, message.duration) / 1e6 : 0
    const endedAt = Date.now()
    const startedAt = endedAt - durationMs
    const operation = sqlOperation(message.sql)

    const span = startSpan('db.sqlite.query', {
      attributes: {
        'db.engine': 'sqlite',
        'db.operation': operation,
      },
      startTime: startedAt,
    })
    if (state.includeRedactedSql) {
      span.setAttribute('db.statement', redactBoundValues(message.sql).slice(0, MAX_STATEMENT_LENGTH))
    }
    span.setStatus('ok')
    span.end(endedAt)

    recordDbOperation('sqlite', operation, durationMs, 'success')
  } catch {
    // Diagnostics must never break statement execution or tracing.
  }
}

/**
 * Subscribe to `sqlite.db.query`. Idempotent. Vitest needs
 * `enabledInTests: true`; the runtime subscribes automatically outside tests
 * with the boot-time `includeRedactedSql` setting.
 */
export function startSqliteQueryTrace(options: SqliteTraceOptions = {}): void {
  if (subscribed) {
    return
  }
  if (isVitest() && options.enabledInTests !== true) {
    return
  }
  state = { includeRedactedSql: options.includeRedactedSql === true }
  diagnostics_channel.subscribe(SQLITE_QUERY_CHANNEL, onQuery)
  subscribed = true
}

export function stopSqliteQueryTrace(): void {
  if (!subscribed) {
    return
  }
  diagnostics_channel.unsubscribe(SQLITE_QUERY_CHANNEL, onQuery)
  subscribed = false
  state = null
}

export function isSqliteQueryTraceSubscribed(): boolean {
  return subscribed
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopSqliteQueryTrace()
  })
}
