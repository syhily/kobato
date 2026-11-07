import type { AppLocale } from '@/shared/i18n/locales'

import { uiMessagesEnUS } from '@/shared/i18n/messages/ui/en-US'
import { uiMessagesZhCN } from '@/shared/i18n/messages/ui/zh-CN'
import { uiMessagesZhHK } from '@/shared/i18n/messages/ui/zh-HK'
import { uiMessagesZhTW } from '@/shared/i18n/messages/ui/zh-TW'

const MESSAGES = {
  'en-US': uiMessagesEnUS,
  'zh-CN': uiMessagesZhCN,
  'zh-HK': uiMessagesZhHK,
  'zh-TW': uiMessagesZhTW,
}

/**
 * A root `matches` slice carrying the loader's i18n payload. Route `meta()`
 * resolves static titles and section labels from HERE (never the settings
 * snapshot), so meta tests pass this instead of an empty matches array.
 */
export function rootMatchesWithI18n(locale: AppLocale = 'zh-CN'): { id: string; loaderData: unknown }[] {
  return [{ id: 'root', loaderData: { i18n: { locale, messages: MESSAGES[locale] } } }]
}
