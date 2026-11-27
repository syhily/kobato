import type { LogSink } from '@kobato/server/infra/logger/sink'
import type { TraceLogsRuntimeConfig } from '@kobato/server/infra/trace/config'
import type { LogSeverityText } from '@kobato/server/infra/trace/log-record'
import type { LogRecord, SeverityNumber } from '@opentelemetry/api'
import type { LogRecordExporter } from '@opentelemetry/sdk-logs'

import { APP_VERSION } from '@kobato/base/distribution/app'
import { observeExporter } from '@kobato/server/infra/trace/export-health'
import { projectLogLine } from '@kobato/server/infra/trace/log-record'
import { traceResourceAttributes } from '@kobato/server/infra/trace/resource'
import { TRACE_LOG_STREAM } from '@kobato/settings/telemetry/logs'
import { SeverityNumber as SeverityNumberEnum } from '@opentelemetry/api'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs'

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
  readonly sink: LogSink
  forceFlush(timeoutMillis?: number): Promise<void>
  shutdown(): Promise<void>
}

export interface LogPipelineOptions {
  exporter?: LogRecordExporter
  healthToken?: object
}

export function buildLogPipeline(config: TraceLogsRuntimeConfig, options: LogPipelineOptions = {}): LogPipeline {
  const constructed =
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
  const exporter =
    options.healthToken === undefined ? constructed : observeExporter(constructed, options.healthToken, 'logs')

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
