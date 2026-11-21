import type { KobatoInklingLabelTable } from '@kobato/i18n/inkling-labels/en-US'
import type { AppLocale } from '@kobato/i18n/locales'

import { kobatoInklingLabelsEnUS } from '@kobato/i18n/inkling-labels/en-US'
import { kobatoInklingLabelsZhCN } from '@kobato/i18n/inkling-labels/zh-CN'
import { kobatoInklingLabelsZhHK } from '@kobato/i18n/inkling-labels/zh-HK'
import { kobatoInklingLabelsZhTW } from '@kobato/i18n/inkling-labels/zh-TW'

const LABELS_BY_LOCALE = {
  'en-US': kobatoInklingLabelsEnUS,
  'zh-HK': kobatoInklingLabelsZhHK,
  'zh-TW': kobatoInklingLabelsZhTW,
  'zh-CN': kobatoInklingLabelsZhCN,
} as const satisfies Record<AppLocale, KobatoInklingLabelTable>

export function inklingLabelsFor(locale: AppLocale): KobatoInklingLabelTable {
  return LABELS_BY_LOCALE[locale]
}
