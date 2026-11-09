// Pure metric names and OpenObserve-derived stream prefixes shared by the
// server catalog and the local trace tooling. This module must stay free of
// serverConfig/logger imports so `scripts/trace/*` can load it directly.

export const TRACE_METRIC_NAMES = {
  httpServerDuration: 'http.server.duration',
  httpServerRequests: 'http.server.requests',
  ssrShellDuration: 'ssr.shell.duration',
  ssrStreamDuration: 'ssr.stream.duration',
  dbOperationDuration: 'db.operation.duration',
  dbOperationCount: 'db.operation.count',
  cacheLookupCount: 'cache.lookup.count',
  imageQueueDuration: 'image.queue.duration',
  imageExecutionDuration: 'image.execution.duration',
  eventLoopDelay: 'event_loop.delay',
} as const

/**
 * O2 stores an OTLP metric `a.b.c` as a stream named `a_b_c`; histograms add
 * `_count`, `_sum`, and `_bucket` siblings. These prefixes identify the
 * Kobato-owned metric streams without duplicating the catalog in scripts.
 */
export const TRACE_METRIC_STREAM_PREFIXES = [
  'http_server_',
  'ssr_',
  'db_operation_',
  'cache_lookup_',
  'image_',
  'event_loop_',
] as const

export const TRACE_METRIC_STREAMS = {
  httpServerDurationCount: 'http_server_duration_count',
  imageExecutionDurationCount: 'image_execution_duration_count',
  imageExecutionDurationSum: 'image_execution_duration_sum',
  imageQueueDurationCount: 'image_queue_duration_count',
  imageQueueDurationSum: 'image_queue_duration_sum',
  eventLoopDelay: 'event_loop_delay',
} as const

export function isTraceMetricStreamName(name: string): boolean {
  return TRACE_METRIC_STREAM_PREFIXES.some((prefix) => name.startsWith(prefix))
}
