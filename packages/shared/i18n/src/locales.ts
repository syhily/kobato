// The closed set of UI locales. HTML `lang`, `Content-Language`, RSS `language`
// and Atom `xml:lang` all use these BCP 47 tags verbatim — `zh-HK` / `zh-TW` are
// already unambiguous, so they are never widened to `zh-Hant-HK` / `zh-Hant-TW`.
// Only Open Graph uses another spelling; see `toOpenGraphLocale`.

export const SUPPORTED_LOCALES = ['en-US', 'zh-HK', 'zh-TW', 'zh-CN'] as const

export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

/** Default UI locale — existing installs rely on it never changing. */
export const DEFAULT_LOCALE: AppLocale = 'zh-CN'

/** The English baseline catalog's tag: the ICU reference and the runtime fallback for missing keys. */
export const BASE_LOCALE: AppLocale = 'en-US'

/**
 * Selector labels are each locale's own endonym — deliberately NOT translated,
 * so a reader can always find their own language in the list.
 */
export const LOCALE_DISPLAY_NAMES = {
  'en-US': 'English (United States)',
  'zh-HK': '繁體中文（香港）',
  'zh-TW': '正體中文（台灣）',
  'zh-CN': '简体中文（中国大陆）',
} as const satisfies Record<AppLocale, string>

// Stored rows may carry a bare language code, a script-qualified tag or an
// underscore separator. Keys are the normalized lookup form (`trim()`, lowercased,
// `_` → `-`), so matching is case-insensitive.
const LOCALE_ALIASES: Record<string, AppLocale> = {
  en: 'en-US',
  'en-us': 'en-US',
  zh: 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-hans': 'zh-CN',
  'zh-hans-cn': 'zh-CN',
  'zh-hk': 'zh-HK',
  'zh-hant-hk': 'zh-HK',
  'zh-tw': 'zh-TW',
  'zh-hant-tw': 'zh-TW',
}

function aliasKey(value: string): string {
  return value.trim().toLowerCase().replaceAll('_', '-')
}

export function isSupportedLocale(value: string): value is AppLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/** Whether a stored value is one the normalizer recognizes (canonical tag or documented alias). */
export function isKnownLocaleValue(value: string): boolean {
  return LOCALE_ALIASES[aliasKey(value)] !== undefined
}

/**
 * Canonicalize a stored locale. Unknown values resolve to {@link DEFAULT_LOCALE}
 * rather than failing: a single bad tag must never drop the whole
 * `siteIdentity` section and mark an installed site as uninstalled.
 */
export function normalizeAppLocale(value: string): AppLocale {
  return LOCALE_ALIASES[aliasKey(value)] ?? DEFAULT_LOCALE
}

const OPEN_GRAPH_LOCALES = {
  'en-US': 'en_US',
  'zh-HK': 'zh_HK',
  'zh-TW': 'zh_TW',
  'zh-CN': 'zh_CN',
} as const satisfies Record<AppLocale, string>

/** `og:locale` is the one surface that uses the underscore spelling. */
export function toOpenGraphLocale(locale: AppLocale): string {
  return OPEN_GRAPH_LOCALES[locale]
}
