import type { KobatoInklingLabelTable } from '@kobato/i18n/inkling-labels/en-US.ts'
import type { AppLocale } from '@kobato/i18n/locales.ts'

import { kobatoInklingLabelsEnUS } from '@kobato/i18n/inkling-labels/en-US.ts'
import { kobatoInklingLabelsZhCN } from '@kobato/i18n/inkling-labels/zh-CN.ts'
import { kobatoInklingLabelsZhHK } from '@kobato/i18n/inkling-labels/zh-HK.ts'
import { kobatoInklingLabelsZhTW } from '@kobato/i18n/inkling-labels/zh-TW.ts'

const LABELS_BY_LOCALE = {
  'en-US': kobatoInklingLabelsEnUS,
  'zh-HK': kobatoInklingLabelsZhHK,
  'zh-TW': kobatoInklingLabelsZhTW,
  'zh-CN': kobatoInklingLabelsZhCN,
} as const satisfies Record<AppLocale, KobatoInklingLabelTable>

export function inklingLabelsFor(locale: AppLocale): KobatoInklingLabelTable {
  return LABELS_BY_LOCALE[locale]
}
