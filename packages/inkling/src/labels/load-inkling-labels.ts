import type { AppLocale } from '@kobato/i18n/locales'
import type { InklingLabelsInput } from '@kobato/inkling-internal/labels/inkling-labels'

const LABEL_TABLE_LOADERS = {
  'en-US': () => import('@kobato/i18n/inkling-labels/en-US').then((table) => table.kobatoInklingLabelsEnUS),
  'zh-CN': () => import('@kobato/i18n/inkling-labels/zh-CN').then((table) => table.kobatoInklingLabelsZhCN),
  'zh-HK': () => import('@kobato/i18n/inkling-labels/zh-HK').then((table) => table.kobatoInklingLabelsZhHK),
  'zh-TW': () => import('@kobato/i18n/inkling-labels/zh-TW').then((table) => table.kobatoInklingLabelsZhTW),
} as const satisfies Record<AppLocale, () => Promise<InklingLabelsInput>>

export function loadInklingLabels(locale: AppLocale): Promise<InklingLabelsInput> {
  return LABEL_TABLE_LOADERS[locale]()
}
