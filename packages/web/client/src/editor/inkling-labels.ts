/**
 * The client seam for Kobato's Inkling label overlay.
 *
 * The four per-locale tables live in `@kobato/i18n/inkling-labels/**` and stay
 * out of the browser's static graph. WORKSPACE documents (`/admin`, `/editor`)
 * read the active locale's table from the root payload
 * (`content.bootstrap.i18n.inklingLabels`) through {@link useKobatoInklingLabels};
 * PUBLIC documents carry no table, so `LazyCommentBodyEditor` calls
 * {@link loadInklingLabels} after activation and exactly one locale chunk is
 * fetched, never all four.
 *
 * Never STATICALLY value-import a table (pinned by
 * `apps/kobato/tests/arch/client-bundle.test.ts`); the dynamic loaders below are the
 * one sanctioned exception. Table values follow Inkling's `string.replace`
 * token contract (`{max}` / `{cardType}` / `{name}` / `{progress}`), not ICU;
 * `<InklingComposer labels={...}>` merges a table over Inkling's English
 * defaults, and `undefined` (no payload, no loaded table) degrades to those.
 * The host-menu namespace (`menu.host.*`) is Inkling's documented opening:
 * host cards name their `labelKey` `host.<name>`, and the spec's English copy
 * is the fallback.
 */

import type { ContentBootstrapI18n } from '@kobato/contracts/content.ts'
import type { KobatoInklingLabelKey } from '@kobato/i18n/inkling-labels/en-US.ts'
import type { AppLocale } from '@kobato/i18n/locales.ts'
import type { InklingHostMenuLabelKey, InklingLabels, InklingLabelsInput } from '@kobato/inkling'

import { useRouteLoaderData } from 'react-router'

/**
 * Compile-time pin: every key of the shared English baseline must be a key Inkling
 * accepts (a built-in key or the `menu.host.*` namespace), so a typo or a stale key
 * fails `pnpm run type`. A union type argument satisfies `T extends U` only when
 * EVERY member does.
 */
type AssertInklingLabelKeys<T extends keyof InklingLabels | InklingHostMenuLabelKey> = T
export type KobatoInklingLabelKeysAreLegal = AssertInklingLabelKeys<KobatoInklingLabelKey>

interface RootI18nData {
  i18n?: ContentBootstrapI18n | null
}

export function useKobatoInklingLabels(): InklingLabelsInput | undefined {
  return useRouteLoaderData<RootI18nData>('root')?.i18n?.inklingLabels
}

/**
 * One dynamic import per locale — the bundler emits four small chunks and a public
 * visitor fetches only the active one. Repeated activations reuse the module
 * registry's cached namespace; a rejected import may be retried on the next mount.
 */
const LABEL_TABLE_LOADERS = {
  'en-US': () => import('@kobato/i18n/inkling-labels/en-US.ts').then((table) => table.kobatoInklingLabelsEnUS),
  'zh-CN': () => import('@kobato/i18n/inkling-labels/zh-CN.ts').then((table) => table.kobatoInklingLabelsZhCN),
  'zh-HK': () => import('@kobato/i18n/inkling-labels/zh-HK.ts').then((table) => table.kobatoInklingLabelsZhHK),
  'zh-TW': () => import('@kobato/i18n/inkling-labels/zh-TW.ts').then((table) => table.kobatoInklingLabelsZhTW),
} as const satisfies Record<AppLocale, () => Promise<InklingLabelsInput>>

export function loadInklingLabels(locale: AppLocale): Promise<InklingLabelsInput> {
  return LABEL_TABLE_LOADERS[locale]()
}
