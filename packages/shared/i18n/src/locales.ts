export const SUPPORTED_LOCALES = ['en-US', 'zh-HK', 'zh-TW', 'zh-CN'] as const

export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: AppLocale = 'zh-CN'

export const BASE_LOCALE: AppLocale = 'en-US'

export const LOCALE_DISPLAY_NAMES = {
  'en-US': 'English (United States)',
  'zh-HK': '繁體中文（香港）',
  'zh-TW': '正體中文（台灣）',
  'zh-CN': '简体中文（中国大陆）',
} as const satisfies Record<AppLocale, string>

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

export function isKnownLocaleValue(value: string): boolean {
  return LOCALE_ALIASES[aliasKey(value)] !== undefined
}

export function normalizeAppLocale(value: string): AppLocale {
  return LOCALE_ALIASES[aliasKey(value)] ?? DEFAULT_LOCALE
}

const OPEN_GRAPH_LOCALES = {
  'en-US': 'en_US',
  'zh-HK': 'zh_HK',
  'zh-TW': 'zh_TW',
  'zh-CN': 'zh_CN',
} as const satisfies Record<AppLocale, string>

export function toOpenGraphLocale(locale: AppLocale): string {
  return OPEN_GRAPH_LOCALES[locale]
}

// The emoji picker's dataset ids (emoji-picker-react). zh-HK has no Cantonese dataset; Traditional
// Chinese is the documented fallback.
const EMOJI_LOCALES = {
  'en-US': 'en',
  'zh-HK': 'zh-hant',
  'zh-TW': 'zh-hant',
  'zh-CN': 'zh',
} as const satisfies Record<AppLocale, string>

export function toEmojiLocale(locale: AppLocale): (typeof EMOJI_LOCALES)[AppLocale] {
  return EMOJI_LOCALES[locale]
}
