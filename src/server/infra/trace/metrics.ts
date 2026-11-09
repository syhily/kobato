// Closed metric catalog and the application-facing recording helpers
// (ADR-0012). SDK-free: `runtime.ts` maps these names onto real OTel
// instruments, and every helper here degrades to a no-op through the facade.
//
// A metric may only be recorded with the attributes declared for it below.
// Values are re-validated by `sanitize.ts`, so an attempt to pass a URL, a
// trace/session id, a slug, or an entity id is dropped before it reaches an
// SDK.

import type { MetricAttributes } from '@/server/infra/trace/facade'
import type { DbEngine, DbOutcome, ImageOperation, ImageSizeBucket } from '@/server/infra/trace/sanitize'
import type { CacheBucketId } from '@/shared/types/cache'

import { counter, histogram } from '@/server/infra/trace/facade'
import { sanitizeAttributeValue } from '@/server/infra/trace/sanitize'
import { TRACE_METRIC_NAMES } from '@/shared/contracts/trace-metrics'

export const METRIC = TRACE_METRIC_NAMES

export type MetricName = (typeof TRACE_METRIC_NAMES)[keyof typeof TRACE_METRIC_NAMES]

type MetricKind = 'counter' | 'histogram' | 'gauge'

interface MetricDefinition {
  kind: MetricKind
  attributes: ReadonlySet<string>
}

const HTTP_ATTRIBUTES = new Set(['http.request.method', 'http.route', 'http.response.status_code'])
const SSR_ATTRIBUTES = new Set(['ssr.outcome'])
const DB_ATTRIBUTES = new Set(['db.engine', 'db.operation', 'db.outcome'])
const CACHE_ATTRIBUTES = new Set(['cache.bucket', 'cache.result', 'cache.coalesced'])
const IMAGE_QUEUE_ATTRIBUTES = new Set(['image.operation', 'image.size_bucket'])
const IMAGE_EXECUTION_ATTRIBUTES = new Set(['image.operation', 'image.size_bucket', 'image.outcome'])

const METRIC_DEFINITIONS: Readonly<Record<MetricName, MetricDefinition>> = {
  [METRIC.httpServerDuration]: { kind: 'histogram', attributes: HTTP_ATTRIBUTES },
  [METRIC.httpServerRequests]: { kind: 'counter', attributes: HTTP_ATTRIBUTES },
  [METRIC.ssrShellDuration]: { kind: 'histogram', attributes: SSR_ATTRIBUTES },
  [METRIC.ssrStreamDuration]: { kind: 'histogram', attributes: SSR_ATTRIBUTES },
  [METRIC.dbOperationDuration]: { kind: 'histogram', attributes: DB_ATTRIBUTES },
  [METRIC.dbOperationCount]: { kind: 'counter', attributes: DB_ATTRIBUTES },
  [METRIC.cacheLookupCount]: { kind: 'counter', attributes: CACHE_ATTRIBUTES },
  [METRIC.imageQueueDuration]: { kind: 'histogram', attributes: IMAGE_QUEUE_ATTRIBUTES },
  [METRIC.imageExecutionDuration]: { kind: 'histogram', attributes: IMAGE_EXECUTION_ATTRIBUTES },
  [METRIC.eventLoopDelay]: { kind: 'gauge', attributes: new Set() },
}

export function isAllowedMetricName(name: string): name is MetricName {
  return Object.hasOwn(METRIC_DEFINITIONS, name)
}

/** The declared instrument kind for a name, or null for an unknown metric. */
export function metricKind(name: string): MetricKind | null {
  return isAllowedMetricName(name) ? METRIC_DEFINITIONS[name].kind : null
}

/** A metric value is finite and non-negative; anything else is dropped. */
export function sanitizeMetricValue(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? value : null
}

/**
 * Project a metric attribute bag through that metric's closed key allowlist.
 * An unknown extra key is ignored, but a DECLARED key with an invalid value
 * drops the whole measurement (return `null`): silently dropping just one
 * attribute would invent a series with a different, unintended dimension set.
 */
export function sanitizeMetricAttributes(
  name: string,
  attributes: MetricAttributes | undefined,
): Record<string, string | number | boolean> | null {
  if (!isAllowedMetricName(name)) {
    return null
  }
  const projected: Record<string, string | number | boolean> = {}
  const allowed = METRIC_DEFINITIONS[name].attributes
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (!allowed.has(key)) {
      continue
    }
    const sanitized = sanitizeAttributeValue(key, value)
    if (sanitized === null) {
      return null
    }
    projected[key] = sanitized
  }
  return projected
}

/** Coarse encoded-byte bucket — a fixed label, never a size or a path. */
export function imageSizeBucket(bytes: number): ImageSizeBucket {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return 'unknown'
  }
  if (bytes < 64 * 1024) {
    return 'lt_64kb'
  }
  if (bytes < 256 * 1024) {
    return 'lt_256kb'
  }
  if (bytes < 1024 * 1024) {
    return 'lt_1mb'
  }
  if (bytes < 4 * 1024 * 1024) {
    return 'lt_4mb'
  }
  return 'gte_4mb'
}

export function recordHttpServer(method: string, route: string, status: number, durationMs: number): void {
  const attributes = {
    'http.request.method': method,
    'http.route': route,
    'http.response.status_code': status,
  }
  histogram(METRIC.httpServerDuration, { description: 'HTTP server request duration', unit: 'ms' }).record(
    durationMs,
    attributes,
  )
  counter(METRIC.httpServerRequests, { description: 'HTTP server requests', unit: '{request}' }).add(1, attributes)
}

export type SsrOutcome = 'ok' | 'error' | 'completed' | 'aborted'

export function recordSsrPhase(phase: 'shell' | 'stream', outcome: SsrOutcome, durationMs: number): void {
  const name = phase === 'shell' ? METRIC.ssrShellDuration : METRIC.ssrStreamDuration
  histogram(name, { description: `SSR ${phase} duration`, unit: 'ms' }).record(durationMs, {
    'ssr.outcome': outcome,
  })
}

export function recordDbOperation(engine: DbEngine, operation: string, durationMs: number, outcome: DbOutcome): void {
  const attributes = { 'db.engine': engine, 'db.operation': operation, 'db.outcome': outcome }
  histogram(METRIC.dbOperationDuration, { description: 'Database operation duration', unit: 'ms' }).record(
    durationMs,
    attributes,
  )
  counter(METRIC.dbOperationCount, { description: 'Database operations', unit: '{operation}' }).add(1, attributes)
}

export function recordCacheLookup(bucket: CacheBucketId, result: 'hit' | 'miss', coalesced: boolean): void {
  counter(METRIC.cacheLookupCount, { description: 'Cache lookups', unit: '{lookup}' }).add(1, {
    'cache.bucket': bucket,
    'cache.result': result,
    'cache.coalesced': coalesced,
  })
}

export function recordImageQueue(operation: ImageOperation, sizeBucket: ImageSizeBucket, durationMs: number): void {
  histogram(METRIC.imageQueueDuration, { description: 'Image worker queue wait', unit: 'ms' }).record(durationMs, {
    'image.operation': operation,
    'image.size_bucket': sizeBucket,
  })
}

export function recordImageExecution(
  operation: ImageOperation,
  sizeBucket: ImageSizeBucket,
  durationMs: number,
  outcome: 'success' | 'error',
): void {
  histogram(METRIC.imageExecutionDuration, { description: 'Image worker execution duration', unit: 'ms' }).record(
    durationMs,
    {
      'image.operation': operation,
      'image.size_bucket': sizeBucket,
      'image.outcome': outcome,
    },
  )
}
