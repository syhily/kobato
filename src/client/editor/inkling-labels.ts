/**
 * The client seam for Kobato's Inkling label overlay.
 *
 * The four per-locale tables live in `@/shared/i18n/inkling-labels/**` and stay
 * out of the browser's static graph. Two ways reach them:
 *
 *  - WORKSPACE documents (`/admin`, `/editor`): `content.bootstrap` ships the
 *    active locale's table as `i18n.inklingLabels`, and
 *    {@link useKobatoInklingLabels} reads it from the root payload.
 *  - PUBLIC documents: the bootstrap carries no table at all. The comment
 *    composer is interaction-gated, so `LazyCommentBodyEditor` calls
 *    {@link loadInklingLabels} AFTER activation; each locale's table is its own
 *    dynamic-import chunk, so exactly one locale is fetched (never all four).
 *
 * Both paths keep one locale (not four, ~22 KB) out of the public comment
 * composer chunk. Never STATICALLY value-import a table (pinned by
 * `tests/unit/arch/client-bundle.test.ts`); the dynamic loaders below are the
 * one sanctioned exception, and they are the only reason that test's owner list
 * names this file.
 *
 * The tables stay independent of the ICU catalogs: Inkling's `string.replace`
 * token contract (`{max}` / `{cardType}` / `{name}` / `{progress}`) is the
 * editor layer's own format. `<InklingComposer labels={...}>` merges the table
 * over Inkling's English defaults; `undefined` (no payload and no loaded table
 * — a root-loader failure or a router-less render) degrades to those defaults.
 *
 * The host-menu namespace (`menu.host.*`) is Inkling's documented opening — host
 * cards name their `labelKey` `host.<name>`, and the English text is the card
 * menu entry's own fallback spec copy.
 */

import { useRouteLoaderData } from 'react-router'

import type { InklingHostMenuLabelKey, InklingLabels, InklingLabelsInput } from '@/inkling'
import type { ContentBootstrapI18n } from '@/shared/contracts/content'
import type { KobatoInklingLabelKey } from '@/shared/i18n/inkling-labels/en-US'
import type { AppLocale } from '@/shared/i18n/locales'

/**
 * Compile-time pin, replacing the `satisfies InklingLabelsInput` check the
 * tables got while they lived in this layer: every key of the shared English
 * baseline must be a key Inkling accepts (a built-in key or the `menu.host.*`
 * namespace). A typo or a stale key in the shared table fails `pnpm run type`.
 * A union type argument satisfies `T extends U` only when EVERY member does.
 */
type AssertInklingLabelKeys<T extends keyof InklingLabels | InklingHostMenuLabelKey> = T
export type KobatoInklingLabelKeysAreLegal = AssertInklingLabelKeys<KobatoInklingLabelKey>

interface RootI18nData {
  i18n?: ContentBootstrapI18n | null
}

/** The active locale's overlay from the root loader payload, or `undefined`. */
export function useKobatoInklingLabels(): InklingLabelsInput | undefined {
  return useRouteLoaderData<RootI18nData>('root')?.i18n?.inklingLabels
}

/**
 * One dynamic import per locale — the bundler emits four small chunks and a
 * public visitor fetches only the one for the active UI locale. Repeated
 * activations reuse the module registry's cached namespace; no application
 * cache is needed (and a rejected import may be retried on the next mount).
 */
const LABEL_TABLE_LOADERS = {
  'en-US': () => import('@/shared/i18n/inkling-labels/en-US').then((table) => table.kobatoInklingLabelsEnUS),
  'zh-CN': () => import('@/shared/i18n/inkling-labels/zh-CN').then((table) => table.kobatoInklingLabelsZhCN),
  'zh-HK': () => import('@/shared/i18n/inkling-labels/zh-HK').then((table) => table.kobatoInklingLabelsZhHK),
  'zh-TW': () => import('@/shared/i18n/inkling-labels/zh-TW').then((table) => table.kobatoInklingLabelsZhTW),
} as const satisfies Record<AppLocale, () => Promise<InklingLabelsInput>>

/** Load the active locale's table for an interaction-gated public composer. */
export function loadInklingLabels(locale: AppLocale): Promise<InklingLabelsInput> {
  return LABEL_TABLE_LOADERS[locale]()
}
