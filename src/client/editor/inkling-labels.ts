// The per-locale Inkling label tables. The composer shell picks the active
// locale's table and hands it to `<InklingComposer labels={...}>`; Inkling
// merges it over its English defaults (an override table, not a catalog).
// These labels deliberately stay OUT of the main ICU catalog: Inkling's
// `string.replace` token contract ({max}, {cardType}, {name}, {progress}) is
// the editor layer's own format.

import type { InklingLabelsInput } from '@/inkling'
import type { AppLocale } from '@/shared/i18n/locales'

import { kobatoInklingLabelsEnUS } from '@/client/editor/inkling-labels/en-US'
import { kobatoInklingLabelsZhCN } from '@/client/editor/inkling-labels/zh-CN'
import { kobatoInklingLabelsZhHK } from '@/client/editor/inkling-labels/zh-HK'
import { kobatoInklingLabelsZhTW } from '@/client/editor/inkling-labels/zh-TW'

const LABELS_BY_LOCALE = {
  'en-US': kobatoInklingLabelsEnUS,
  'zh-CN': kobatoInklingLabelsZhCN,
  'zh-HK': kobatoInklingLabelsZhHK,
  'zh-TW': kobatoInklingLabelsZhTW,
} as const satisfies Record<AppLocale, InklingLabelsInput>

/** The active locale's overlay table (stable identity per locale). */
export function kobatoInklingLabels(locale: AppLocale): InklingLabelsInput {
  return LABELS_BY_LOCALE[locale]
}
