import type { AnalyticsReader } from '@kobato/db/duckdb/connection'
import type { RealtimeEvent } from '@kobato/db/duckdb/queries/types'

import { queryRealtimeTail } from '@kobato/db/duckdb/queries/realtime'
import { acquireRealtimeConnection } from '@kobato/server/domains/analytics/services/realtime-connections'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'

const POLL_INTERVAL_MS = 2_000

function waitForNextPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, POLL_INTERVAL_MS)
    function done() {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    signal.addEventListener('abort', done, { once: true })
  })
}

export function realtimeEventBatches(
  reader: () => AnalyticsReader,
  connectionKey: string,
  since: string | undefined,
  signal: AbortSignal,
): AsyncGenerator<RealtimeEvent[], void, void> {
  const releaseConnection = acquireRealtimeConnection(connectionKey)
  if (releaseConnection === null) {
    throw new ActionFailure(429, descriptorFor('error.api.rateLimited'))
  }
  let lastSeen = since === undefined ? new Date(Date.now() - 60_000) : new Date(since)
  if (Number.isNaN(lastSeen.getTime())) {
    lastSeen = new Date(Date.now() - 60_000)
  }

  const generator = (async function* () {
    try {
      while (!signal.aborted) {
        try {
          const rows = await queryRealtimeTail(reader(), lastSeen)
          if (rows.length > 0) {
            const ordered = rows.map((_, index) => rows[rows.length - index - 1]!)
            lastSeen = new Date(ordered[ordered.length - 1]!.ts)
            yield ordered
          }
        } catch (error) {
          getLogger('analytics.realtime').warn('queryRealtimeTail failed', {
            error: error instanceof Error ? error.message : String(error),
          })
        }
        await waitForNextPoll(signal)
      }
    } finally {
      releaseConnection()
    }
  })()

  const close = async () => {
    releaseConnection()
    void generator.return(undefined).catch(() => undefined)
    return { done: true as const, value: undefined }
  }

  return {
    next: () => generator.next(),
    return: close,
    throw: async (error) => {
      releaseConnection()
      return generator.throw(error)
    },
    [Symbol.asyncIterator]() {
      return this
    },
    [Symbol.asyncDispose]: async () => {
      await close()
    },
  }
}
