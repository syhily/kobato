// The locale → Inkling label table aggregation. SERVER-ONLY value surface, the
// same shape as `catalog.ts`: the four tables are data the browser must never
// import wholesale, so the root loader ships ONLY the active locale's table as
// `i18n.inklingLabels` in the `content.bootstrap` payload. The client resolver
// (`@/client/editor/inkling-labels`) reads the payload; no client module may
// value-import this module or a per-locale table (pinned by
// `tests/unit/arch/client-bundle.test.ts`).
//
// The tables stay OUT of the ICU catalogs on purpose: Inkling's `string.replace`
// token contract (`{max}`, `{cardType}`, `{name}`, `{progress}`) is the editor
// layer's own format, and `InklingComposer labels={...}` merges the table over
// Inkling's English defaults at runtime.

import type { KobatoInklingLabelTable } from '@/shared/i18n/inkling-labels/en-US'
import type { AppLocale } from '@/shared/i18n/locales'

import { kobatoInklingLabelsEnUS } from '@/shared/i18n/inkling-labels/en-US'
import { kobatoInklingLabelsZhCN } from '@/shared/i18n/inkling-labels/zh-CN'
import { kobatoInklingLabelsZhHK } from '@/shared/i18n/inkling-labels/zh-HK'
import { kobatoInklingLabelsZhTW } from '@/shared/i18n/inkling-labels/zh-TW'

const LABELS_BY_LOCALE = {
  'en-US': kobatoInklingLabelsEnUS,
  'zh-HK': kobatoInklingLabelsZhHK,
  'zh-TW': kobatoInklingLabelsZhTW,
  'zh-CN': kobatoInklingLabelsZhCN,
} as const satisfies Record<AppLocale, KobatoInklingLabelTable>

/**
 * The active locale's complete overlay table. Every locale is a full table (the
 * zh tables are held to `KobatoInklingLabelKey`), so there is no English merge
 * here — Inkling merges the override over its own defaults at the composer.
 */
export function inklingLabelsFor(locale: AppLocale): KobatoInklingLabelTable {
  return LABELS_BY_LOCALE[locale]
}
