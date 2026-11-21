import type { ContentBootstrapI18n } from '@kobato/contracts/content'
import type { KobatoInklingLabelKey } from '@kobato/i18n/inkling-labels/en-US'
import type { AppLocale } from '@kobato/i18n/locales'
import type { InklingHostMenuLabelKey, InklingLabels, InklingLabelsInput } from '@kobato/inkling'

import { useRouteLoaderData } from 'react-router'

type AssertInklingLabelKeys<T extends keyof InklingLabels | InklingHostMenuLabelKey> = T
export type KobatoInklingLabelKeysAreLegal = AssertInklingLabelKeys<KobatoInklingLabelKey>

interface RootI18nData {
  i18n?: ContentBootstrapI18n | null
}

export function useKobatoInklingLabels(): InklingLabelsInput | undefined {
  return useRouteLoaderData<RootI18nData>('root')?.i18n?.inklingLabels
}

const LABEL_TABLE_LOADERS = {
  'en-US': () => import('@kobato/i18n/inkling-labels/en-US').then((table) => table.kobatoInklingLabelsEnUS),
  'zh-CN': () => import('@kobato/i18n/inkling-labels/zh-CN').then((table) => table.kobatoInklingLabelsZhCN),
  'zh-HK': () => import('@kobato/i18n/inkling-labels/zh-HK').then((table) => table.kobatoInklingLabelsZhHK),
  'zh-TW': () => import('@kobato/i18n/inkling-labels/zh-TW').then((table) => table.kobatoInklingLabelsZhTW),
} as const satisfies Record<AppLocale, () => Promise<InklingLabelsInput>>

export function loadInklingLabels(locale: AppLocale): Promise<InklingLabelsInput> {
  return LABEL_TABLE_LOADERS[locale]()
}
