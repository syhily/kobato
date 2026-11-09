import type { Histogram, MetricData, PushMetricExporter, ResourceMetrics } from '@opentelemetry/sdk-metrics'

import { type ExportResult, ExportResultCode } from '@opentelemetry/core'
import { AggregationTemporalityPreference, type OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import {
  AggregationTemporality,
  InstrumentType,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics'
import { describe, expect, it } from 'vitest'

import type { ServerTraceRuntimeConfig } from '@/server/infra/trace/config'

import { buildMetricExporter } from '@/server/infra/trace/runtime'

const CONFIG: ServerTraceRuntimeConfig = {
  endpoint: 'http://127.0.0.1:5080',
  organization: 'default',
  authorizationHeader: 'Basic dGVzdDp0ZXN0',
  sampleRate: 1,
  includeRedactedSql: false,
  otlpTracesUrl: 'http://127.0.0.1:5080/api/default/v1/traces',
  otlpMetricsUrl: 'http://127.0.0.1:5080/api/default/v1/metrics',
}

/**
 * Faithful push exporter: it forwards the real OTLP exporter's temporality and
 * aggregation selectors into the SDK reader, then captures the collected
 * batches instead of serializing protobuf over HTTP. This exercises the real
 * `PeriodicExportingMetricReader` collection/reset path, not a hand-rolled
 * reader with SDK defaults.
 */
class RecordingExporter implements PushMetricExporter {
  readonly batches: ResourceMetrics[] = []

  constructor(private readonly delegate: OTLPMetricExporter) {}

  export(metrics: ResourceMetrics, resultCallback: (result: ExportResult) => void): void {
    this.batches.push(metrics)
    resultCallback({ code: ExportResultCode.SUCCESS })
  }

  forceFlush(): Promise<void> {
    return Promise.resolve()
  }

  shutdown(): Promise<void> {
    return Promise.resolve()
  }

  selectAggregationTemporality(instrumentType: InstrumentType): AggregationTemporality {
    return this.delegate.selectAggregationTemporality(instrumentType)
  }

  selectAggregation(instrumentType: InstrumentType) {
    return this.delegate.selectAggregation(instrumentType)
  }
}

function series(exporter: RecordingExporter, name: string): MetricData[] {
  return exporter.batches
    .flatMap((batch) => batch.scopeMetrics)
    .flatMap((scope) => scope.metrics)
    .filter((metric) => metric.descriptor.name === name)
}

describe('metric exporter temporality', () => {
  it('pins DELTA for counters/histograms and keeps up-down counters cumulative', () => {
    const exporter = buildMetricExporter(CONFIG)
    expect(AggregationTemporalityPreference.DELTA).toBe(AggregationTemporality.DELTA)
    for (const instrument of [
      InstrumentType.COUNTER,
      InstrumentType.OBSERVABLE_COUNTER,
      InstrumentType.GAUGE,
      InstrumentType.OBSERVABLE_GAUGE,
      InstrumentType.HISTOGRAM,
    ]) {
      expect(exporter.selectAggregationTemporality(instrument), instrument).toBe(AggregationTemporality.DELTA)
    }
    for (const instrument of [InstrumentType.UP_DOWN_COUNTER, InstrumentType.OBSERVABLE_UP_DOWN_COUNTER]) {
      expect(exporter.selectAggregationTemporality(instrument), instrument).toBe(AggregationTemporality.CUMULATIVE)
    }
  })

  it('the real periodic reader exports interval increments, not cumulative snapshots', async () => {
    const exporter = new RecordingExporter(buildMetricExporter(CONFIG))
    const reader = new PeriodicExportingMetricReader({
      exporter,
      exportIntervalMillis: 60_000,
      exportTimeoutMillis: 5_000,
    })
    const provider = new MeterProvider({ readers: [reader] })
    try {
      const meter = provider.getMeter('temporality-test')
      const counter = meter.createCounter('test.delta.counter')
      const histogram = meter.createHistogram('test.delta.histogram', { unit: 'ms' })

      counter.add(5)
      histogram.record(10)
      histogram.record(20)
      await reader.forceFlush()

      counter.add(3)
      histogram.record(5)
      await reader.forceFlush()
    } finally {
      await provider.shutdown()
    }

    const counterSeries = series(exporter, 'test.delta.counter')
    expect(counterSeries.map((metric) => metric.aggregationTemporality)).toEqual([
      AggregationTemporality.DELTA,
      AggregationTemporality.DELTA,
    ])
    expect(counterSeries.flatMap((metric) => metric.dataPoints.map((point) => point.value))).toEqual([5, 3])

    const histogramSeries = series(exporter, 'test.delta.histogram')
    expect(histogramSeries.map((metric) => metric.aggregationTemporality)).toEqual([
      AggregationTemporality.DELTA,
      AggregationTemporality.DELTA,
    ])
    const histogramValues = histogramSeries.flatMap((metric) =>
      metric.dataPoints.map((point) => point.value as Histogram),
    )
    expect(histogramValues.map((value) => value.sum)).toEqual([30, 5])
    expect(histogramValues.map((value) => value.count)).toEqual([2, 1])
  })
})
