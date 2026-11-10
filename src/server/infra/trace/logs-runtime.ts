// OpenObserve log pipeline (ADR-0012; activated from the `observability`
// settings section, in every build).
//
// The second server SDK implementation entry, next to `runtime.ts`. It is
// constructed by the trace runtime — never imported by anything else — and it
// consumes only the already-projected record stream: `log-record.ts` decides
// what a line may say, this module only ships it. No stdout logger is imported
// here, so an exporter hiccup cannot turn into a log line (and a log line
// cannot loop back into this pipeline).
//
// Boundaries that matter here:
// - Fixed resource attributes come from `resource.ts` (one three-key object).
// - The direct OTLP/HTTP exporter carries the server-only authorization header
//   plus the OpenObserve `stream-name`; it is never projected to the browser.
// - Bounded batch pipeline (1024/256/1s/3s, one export in flight), so a stalled
//   OpenObserve instance drops log records instead of growing the heap.
// - The SDK associates the active trace context itself (`context.active()`);
//   callers pass no context and no exception object.

import type { LogRecord, SeverityNumber } from '@opentelemetry/api'
import type { LogRecordExporter } from '@opentelemetry/sdk-logs'

import { SeverityNumber as SeverityNumberEnum } from '@opentelemetry/api'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs'

import type { LogSink } from '@/server/infra/logger/sink'
import type { TraceLogsRuntimeConfig } from '@/server/infra/trace/config'
import type { LogSeverityText } from '@/server/infra/trace/log-record'

import { projectLogLine } from '@/server/infra/trace/log-record'
import { traceResourceAttributes } from '@/server/infra/trace/resource'
import { APP_VERSION } from '@/shared/config/version'
import { TRACE_LOG_STREAM } from '@/shared/contracts/trace-logs'

const LOGGER_NAME = 'kobato-server-logs'
const LOGGER_VERSION = APP_VERSION

const MAX_QUEUE_SIZE = 1024
const MAX_EXPORT_BATCH_SIZE = 256
const SCHEDULED_DELAY_MS = 1000
const EXPORT_TIMEOUT_MS = 3000
const ATTRIBUTE_COUNT_LIMIT = 8
const ATTRIBUTE_VALUE_LENGTH_LIMIT = 256

const SEVERITY_NUMBERS: Readonly<Record<LogSeverityText, SeverityNumber>> = {
  INFO: SeverityNumberEnum.INFO,
  WARN: SeverityNumberEnum.WARN,
  ERROR: SeverityNumberEnum.ERROR,
  FATAL: SeverityNumberEnum.FATAL,
}

export interface LogPipeline {
  /** Installed into the Pino writable's sink slot by the runtime. */
  readonly sink: LogSink
  /** Bounded flush; resolves, never rejects. */
  forceFlush(timeoutMillis?: number): Promise<void>
  /** Idempotent provider shutdown; resolves, never rejects. */
  shutdown(): Promise<void>
}

export interface LogPipelineOptions {
  /** Test seam: in-memory exporter instead of direct OTLP/HTTP. */
  exporter?: LogRecordExporter
}

/**
 * Build the log pipeline. Construction failures clean up whatever was created
 * and rethrow so the caller can degrade logs only (traces/metrics continue).
 */
export function buildLogPipeline(config: TraceLogsRuntimeConfig, options: LogPipelineOptions = {}): LogPipeline {
  const exporter =
    options.exporter ??
    new OTLPLogExporter({
      url: config.otlpLogsUrl,
      headers: {
        Authorization: config.authorizationHeader,
        'stream-name': TRACE_LOG_STREAM,
      },
      timeoutMillis: EXPORT_TIMEOUT_MS,
      concurrencyLimit: 1,
    })

  let provider: LoggerProvider | null = null
  let processor: BatchLogRecordProcessor | null = null
  try {
    processor = new BatchLogRecordProcessor({
      exporter,
      maxQueueSize: MAX_QUEUE_SIZE,
      maxExportBatchSize: MAX_EXPORT_BATCH_SIZE,
      scheduledDelayMillis: SCHEDULED_DELAY_MS,
      exportTimeoutMillis: EXPORT_TIMEOUT_MS,
    })
    provider = new LoggerProvider({
      resource: resourceFromAttributes(traceResourceAttributes()),
      processors: [processor],
      logRecordLimits: {
        attributeCountLimit: ATTRIBUTE_COUNT_LIMIT,
        attributeValueLengthLimit: ATTRIBUTE_VALUE_LENGTH_LIMIT,
      },
    })
    const created = provider
    const otelLogger = created.getLogger(LOGGER_NAME, LOGGER_VERSION)

    let stopped = false
    const sink: LogSink = {
      push(line) {
        if (stopped) {
          return
        }
        const projection = projectLogLine(line, Date.now())
        if (projection.kind === 'drop') {
          return
        }
        const { record } = projection
        const logRecord: LogRecord = {
          timestamp: record.timestampMs,
          severityNumber: SEVERITY_NUMBERS[record.severityText],
          severityText: record.severityText,
          attributes: { ...record.attributes },
        }
        if (record.body !== undefined) {
          logRecord.body = record.body
        }
        otelLogger.emit(logRecord)
      },
    }

    return {
      sink,
      forceFlush(timeoutMillis) {
        if (stopped) {
          return Promise.resolve()
        }
        return created.forceFlush({ timeoutMillis }).catch(() => undefined)
      },
      shutdown() {
        if (stopped) {
          return Promise.resolve()
        }
        stopped = true
        return created.shutdown().catch(() => undefined)
      },
    }
  } catch (error) {
    const createdProvider = provider
    const createdProcessor = processor
    provider = null
    processor = null
    // Release whatever was constructed: provider shutdown also shuts its
    // processor (and that processor's exporter).
    const cleanup =
      createdProvider !== null
        ? createdProvider.shutdown()
        : createdProcessor !== null
          ? createdProcessor.shutdown()
          : exporter.shutdown()
    void cleanup.catch(() => undefined)
    throw error
  }
}
