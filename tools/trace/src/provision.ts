import type { O2Context, StreamInfo } from '@kobato/trace/lib'

import { isRelevantTraceStream, listStreams, RETENTION_DAYS, setRetention } from '@kobato/trace/lib'

export interface RetentionReport {
  applied: number
  missing: boolean
  streams: Array<{ name: string; type: string; retention: number }>
}

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
