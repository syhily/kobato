// Analytics metric labels — NEUTRAL registry: every value is a UI message id,
// resolved by the consumer's `useI18n()`. Kept out of the components so the
// filter chips, group tabs and tooltip labels can never drift apart.

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
