import { isRecord } from '@kobato/base/utils/type-guards'
import { isVitest } from '@kobato/server/infra/config'
import { getLogger, root } from '@kobato/server/infra/logger'
import diagnostics_channel from 'node:diagnostics_channel'

const log = getLogger('db.query')

const SQLITE_QUERY_CHANNEL = 'sqlite.db.query'

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
  try {
    if (!isRecord(message) || typeof message.sql !== 'string' || typeof message.duration !== 'number') {
      return
    }
    log.debug('sqlite query', {
      sql: redactBoundValues(message.sql),
      durationMs: Math.round(message.duration / 1e3) / 1e3,
    })
  } catch {}
}

let subscribed = false

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

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopQueryDiagnostics()
  })
}
