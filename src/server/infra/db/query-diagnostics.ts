// Statement timing via the 'sqlite.db.query' diagnostics channel (Node 26.8,
// experimental). The channel publishes { sql, database, duration } per
// completed statement — `sql` is the EXPANDED SQL with bound values inlined,
// so it is redacted back to placeholders before logging; bound parameter
// values never reach the log. Subscription is gated on the debug log level
// (zero overhead at info+ in production) and is a no-op under vitest unless
// a test opts in explicitly.

import diagnostics_channel from 'node:diagnostics_channel'

import { isVitest } from '@/server/infra/config'
import { getLogger, root } from '@/server/infra/logger'
import { isRecord } from '@/shared/utils/type-guards'

const log = getLogger('db.query')

const SQLITE_QUERY_CHANNEL = 'sqlite.db.query'

/**
 * Redact every literal the expanded SQL carries: single-quoted strings (with
 * '' escapes), X'..' blob literals, and bare numeric literals become `?`.
 * Double-quoted identifiers pass through verbatim. Heuristic by design — it
 * errs toward removing data, not preserving the exact source shape.
 */
export function redactBoundValues(expanded: string): string {
  let out = ''
  let segment = ''
  const flushSegment = () => {
    out += segment.replace(/\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, '?')
    segment = ''
  }
  let i = 0
  while (i < expanded.length) {
    const ch = expanded[i]
    if (ch === "'") {
      flushSegment()
      i++
      while (i < expanded.length) {
        if (expanded[i] === "'") {
          if (expanded[i + 1] === "'") {
            i += 2
            continue
          }
          i++
          break
        }
        i++
      }
      out += '?'
      continue
    }
    if (ch === '"') {
      flushSegment()
      let end = i + 1
      while (end < expanded.length) {
        if (expanded[end] === '"') {
          if (expanded[end + 1] === '"') {
            end += 2
            continue
          }
          end++
          break
        }
        end++
      }
      out += expanded.slice(i, end)
      i = end
      continue
    }
    if ((ch === 'x' || ch === 'X') && expanded[i + 1] === "'") {
      // Blob literal prefix — the quote branch below consumes the body.
      i++
      continue
    }
    segment += ch
    i++
  }
  flushSegment()
  return out
}

function onQuery(message: unknown): void {
  // A throwing subscriber would break statement completion — never throw.
  try {
    if (!isRecord(message) || typeof message.sql !== 'string' || typeof message.duration !== 'number') {
      return
    }
    log.debug('sqlite query', {
      sql: redactBoundValues(message.sql),
      durationMs: Math.round(message.duration / 1e3) / 1e3,
    })
  } catch {
    // diagnostics must never break statement execution
  }
}

let subscribed = false

/**
 * Subscribe to 'sqlite.db.query' and forward timings to the logger at debug
 * level. Idempotent. No-op under vitest or above the debug log level unless
 * `enabledInTests` opts in (the test seam — the suite runs the logger at
 * 'silent').
 */
export function startQueryDiagnostics(options?: { enabledInTests?: boolean }): void {
  if (subscribed) {
    return
  }
  const forced = options?.enabledInTests === true
  if (isVitest() && !forced) {
    return
  }
  if (!forced && !root.isLevelEnabled('debug')) {
    return
  }
  diagnostics_channel.subscribe(SQLITE_QUERY_CHANNEL, onQuery)
  subscribed = true
}

export function stopQueryDiagnostics(): void {
  if (!subscribed) {
    return
  }
  diagnostics_channel.unsubscribe(SQLITE_QUERY_CHANNEL, onQuery)
  subscribed = false
}

// HMR re-evaluates the bootstrap graph; drop the old subscription so the
// re-run does not double-subscribe with a stale closure.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopQueryDiagnostics()
  })
}
