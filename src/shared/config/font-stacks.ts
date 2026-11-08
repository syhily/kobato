// Default font chains per UI locale (plan 001, 5c).
//
// `src/styles/tailwind.css` applies the zh-CN chain on `:root` and overrides
// `--font-body` / `--font-serif` through `:lang()` branches for the other
// locales. The SAME map feeds `src/root.tsx`, where a configured custom family
// is prepended to the locale's fallback tail — so a custom font keeps a
// locale-appropriate fallback chain instead of a hardcoded CJK one.
//
// The CSS copy and this map are contract-pinned
// (`tests/unit/contract/font-stacks.test.ts`): change both or neither.
// Custom font selections themselves are untouched — only the fallback tail.

import type { AppLocale } from '@/shared/i18n/locales'

export interface LocaleFontStacks {
  /** Chrome / interface body chain. */
  body: string
  /** Article-body serif chain. */
  serif: string
  code: string
}

const EMOJI = "'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'"

const ZH_CN: LocaleFontStacks = {
  body:
    "'OPPO Sans 4.0', 'OPPO Sans', OPPOSans, 'PingFang SC', 'Lantinghei SC', 'Microsoft YaHei', " +
    "'Source Han Sans CN', -apple-system, BlinkMacSystemFont, 'HanHei SC', 'Helvetica Neue', 'Open Sans', Arial, " +
    `'Hiragino Sans GB', STHeiti, 'WenQuanYi Micro Hei', SimSun, sans-serif, ${EMOJI}`,
  serif: "'OPPO Serif SC', 'Source Han Serif SC', 'Noto Serif CJK SC', 'Songti SC', SimSun, Georgia, Times, serif",
  code: "'Iosevka', monospace",
}

const ZH_TW: LocaleFontStacks = {
  body:
    "'OPPO Sans 4.0', 'OPPO Sans', OPPOSans, 'PingFang TC', 'Lantinghei TC', 'Microsoft JhengHei', " +
    "'Source Han Sans TW', -apple-system, BlinkMacSystemFont, 'HanHei TC', 'Helvetica Neue', 'Open Sans', Arial, " +
    `'Hiragino Sans CNS', STHeiti, 'WenQuanYi Micro Hei', sans-serif, ${EMOJI}`,
  serif: "'Source Han Serif TW', 'Noto Serif CJK TC', 'Songti TC', 'PMingLiU', Georgia, Times, serif",
  code: "'Iosevka', monospace",
}

const ZH_HK: LocaleFontStacks = {
  body:
    "'OPPO Sans 4.0', 'OPPO Sans', OPPOSans, 'PingFang HK', 'Lantinghei TC', 'Microsoft JhengHei', " +
    "'Source Han Sans HK', -apple-system, BlinkMacSystemFont, 'HanHei TC', 'Helvetica Neue', 'Open Sans', Arial, " +
    `'Hiragino Sans CNS', STHeiti, 'WenQuanYi Micro Hei', sans-serif, ${EMOJI}`,
  serif: "'Source Han Serif HK', 'Noto Serif CJK HK', 'Songti TC', 'PMingLiU', Georgia, Times, serif",
  code: "'Iosevka', monospace",
}

const EN_US: LocaleFontStacks = {
  body:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', " +
    `'Liberation Sans', sans-serif, ${EMOJI}`,
  serif: "Georgia, 'Times New Roman', Times, 'Noto Serif', 'Liberation Serif', serif",
  code: "'Iosevka', monospace",
}

export const DEFAULT_FONT_STACKS = {
  'en-US': EN_US,
  'zh-CN': ZH_CN,
  'zh-TW': ZH_TW,
  'zh-HK': ZH_HK,
} as const satisfies Record<AppLocale, LocaleFontStacks>

export function defaultFontStackFor(locale: AppLocale): LocaleFontStacks {
  return DEFAULT_FONT_STACKS[locale]
}
