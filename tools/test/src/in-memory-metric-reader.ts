import type { DataPoint, MetricData, ResourceMetrics } from '@opentelemetry/sdk-metrics'

import { MetricReader } from '@opentelemetry/sdk-metrics'

export class TestMetricReader extends MetricReader {
  protected onForceFlush(): Promise<void> {
    return Promise.resolve()
  }

  protected onShutdown(): Promise<void> {
    return Promise.resolve()
  }

  async collectResourceMetrics(): Promise<ResourceMetrics> {
    const { resourceMetrics } = await this.collect()
    return resourceMetrics
  }
}

export function metricsOf(resourceMetrics: ResourceMetrics): MetricData[] {
  return resourceMetrics.scopeMetrics.flatMap((scope) => scope.metrics)
}

export function metricByName(resourceMetrics: ResourceMetrics, name: string): MetricData | undefined {
  return metricsOf(resourceMetrics).find((metric) => metric.descriptor.name === name)
}

export function dataPointsOf(resourceMetrics: ResourceMetrics, name: string): DataPoint<unknown>[] {
  return metricByName(resourceMetrics, name)?.dataPoints ?? []
}

export function pointValue(point: DataPoint<unknown>): number | null {
  if (typeof point.value === 'number') {
    return point.value
  }
  if (point.value !== null && typeof point.value === 'object') {
    const record = point.value as { sum?: unknown; count?: unknown; min?: unknown; max?: unknown }
    if (typeof record.sum === 'number') {
      return record.sum
    }
    if (typeof record.count === 'number') {
      return record.count
    }
  }
  return null
}
