import type { AppLocale } from '@kobato/i18n/locales'
type TestTranslator = (id: string, values?: any) => string

import { uiMessagesEnUS } from '@kobato/i18n/messages/ui/en-US'
import { uiMessagesZhCN } from '@kobato/i18n/messages/ui/zh-CN'
import { uiMessagesZhHK } from '@kobato/i18n/messages/ui/zh-HK'
import { uiMessagesZhTW } from '@kobato/i18n/messages/ui/zh-TW'
import { createIntl, createIntlCache } from 'react-intl'

const MESSAGES = {
  'en-US': uiMessagesEnUS,
  'zh-CN': uiMessagesZhCN,
  'zh-HK': uiMessagesZhHK,
  'zh-TW': uiMessagesZhTW,
}

export function rootMatchesWithI18n(locale: AppLocale = 'zh-CN'): { id: string; loaderData: unknown }[] {
  return [{ id: 'root', loaderData: { i18n: { locale, messages: MESSAGES[locale] } } }]
}

const intlCache = createIntlCache()
const translators = new Map<AppLocale, TestTranslator>()

export function makeTranslator(locale: AppLocale = 'zh-CN'): TestTranslator {
  const cached = translators.get(locale)
  if (cached !== undefined) {
    return cached
  }
  const intl = createIntl({ locale, messages: MESSAGES[locale], onError: () => {} }, intlCache)
  const t: TestTranslator = (id, params) => intl.formatMessage({ id }, params) as unknown as string
  translators.set(locale, t)
  return t
}

export const tZhCN = makeTranslator('zh-CN')
