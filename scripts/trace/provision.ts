// Dev-container retention policy for the OpenObserve development setup.
//
// The SERVER owns asset provisioning end to end: the RUM client token, the
// privacy pipeline + function, and the four versioned dashboards are installed
// by `admin.observability.testConnection` (idempotent, also re-applied by the
// boot auto-upgrade). Retention is server-owned only when the admin opts in
// (`observability.retentionDays`); production keeps the operator's OpenObserve
// policy otherwise, while this dev container wants the shortest representable
// window. `trace:init` and the smoke therefore apply it through this module.

import type { O2Context, StreamInfo } from './lib.ts'

import { isRelevantTraceStream, listStreams, RETENTION_DAYS, setRetention } from './lib.ts'

export interface RetentionReport {
  applied: number
  missing: boolean
  streams: Array<{ name: string; type: string; retention: number }>
}

/**
 * Apply the 1-day dev retention to every Kobato-relevant stream. Streams are
 * created lazily by the first ingest, so a run before any request reports
 * `missing: true` and applies nothing.
 */
export async function applyRetention(ctx: O2Context): Promise<RetentionReport> {
  const streams: StreamInfo[] = []
  for (const type of ['logs', 'traces', 'metrics'] as const) {
    const list = await listStreams(ctx, type)
    for (const stream of list) {
      streams.push({ ...stream, stream_type: type })
    }
  }
  const relevant = streams.filter((stream) => isRelevantTraceStream(stream.name))
  let applied = 0
  for (const stream of relevant) {
    if ((stream.settings?.data_retention ?? 0) !== RETENTION_DAYS) {
      await setRetention(ctx, stream, RETENTION_DAYS)
      applied += 1
    }
  }
  return {
    applied,
    missing: relevant.length === 0,
    streams: relevant.map((stream) => ({
      name: stream.name,
      type: stream.stream_type,
      retention: stream.settings?.data_retention ?? RETENTION_DAYS,
    })),
  }
}
