import type { MetricType } from '@/shared/contracts/analytics'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

export type HeatmapMetricKey = 'visits' | 'visitors'

export const METRIC_TYPE_LABEL_IDS: Record<MetricType, UiMessageId> = {
  country: 'admin.analytics.metric.country',
  region: 'admin.analytics.metric.region',
  city: 'admin.analytics.metric.city',
  referer: 'admin.analytics.metric.referer',
  language: 'admin.analytics.metric.language',
  timezone: 'admin.analytics.metric.timezone',
  os: 'admin.analytics.metric.os',
  browser: 'admin.analytics.metric.browser',
  browserType: 'admin.analytics.metric.browserType',
  device: 'admin.analytics.metric.device',
  deviceType: 'admin.analytics.metric.deviceType',
  screen: 'admin.analytics.metric.screen',
  viewport: 'admin.analytics.metric.viewport',
  dpr: 'admin.analytics.metric.dpr',
  touch: 'admin.analytics.metric.touch',
  colorScheme: 'admin.analytics.metric.colorScheme',
  netEffectiveType: 'admin.analytics.metric.netEffectiveType',
  path: 'admin.analytics.metric.path',
}

export const HEATMAP_METRIC_LABEL_IDS: Record<HeatmapMetricKey, UiMessageId> = {
  visits: 'admin.analytics.metric.visits',
  visitors: 'admin.analytics.metric.visitors',
}

/** Locale-neutral bucket tokens from the server dimension expressions; the token stays
 *  the wire/filter value so a clicked row round-trips. */
export const METRIC_VALUE_LABEL_IDS: Partial<Record<MetricType, Record<string, UiMessageId>>> = {
  dpr: { other: 'admin.analytics.metrics.value.other' },
  touch: {
    none: 'admin.analytics.metrics.value.touchNone',
    '1-5': 'admin.analytics.metrics.value.touch1to5',
    '6-10': 'admin.analytics.metrics.value.touch6to10',
    many: 'admin.analytics.metrics.value.touchMany',
  },
}

export function metricValueLabelId(type: MetricType, value: string): UiMessageId | null {
  return METRIC_VALUE_LABEL_IDS[type]?.[value] ?? null
}
