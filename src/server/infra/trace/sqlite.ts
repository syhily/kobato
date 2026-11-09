// Trace-only `sqlite.db.query` subscriber (ADR-0012).
//
// Deliberately independent of `infra/db/query-diagnostics.ts`: tracing must
// not require the debug log level, and the debug subscriber's redaction rules
// are not the trace privacy contract.
//
// The diagnostics channel publishes AFTER a statement completes and only for
// successful statements: `duration` is nanoseconds. The span is therefore
// created with an explicit start/end derived from the reported duration, and
// only when a request/job span is already active — a boot-time migration or a
// timer flush without an active span produces nothing.

import diagnostics_channel from 'node:diagnostics_channel'

import { isVitest } from '@/server/infra/config'
import { redactBoundValues } from '@/server/infra/db/query-diagnostics'
import { activeTraceIds, isTraceActive, startSpan } from '@/server/infra/trace/facade'
import { recordDbOperation } from '@/server/infra/trace/metrics'
import { isRecord } from '@/shared/utils/type-guards'

const SQLITE_QUERY_CHANNEL = 'sqlite.db.query'

/** Expanded SQL is never exported; only this bounded redacted form is. */
const MAX_STATEMENT_LENGTH = 512

/** Closed operation vocabulary derived from the statement's first keyword. */
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
  /** Add the bounded, redacted statement text to the span. */
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
 * `enabledInTests: true`; the DEV runtime subscribes automatically outside
 * tests with the boot-time `includeRedactedSql` setting.
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

/** Test seam: report whether the trace subscriber (not the debug one) is live. */
export function isSqliteQueryTraceSubscribed(): boolean {
  return subscribed
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopSqliteQueryTrace()
  })
}
