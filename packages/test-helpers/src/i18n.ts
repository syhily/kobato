import type { AppLocale } from '@kobato/shared/i18n/locales.ts'
import type { I18nValue } from '@kobato/web/ui/lib/I18nProvider.tsx'

import { uiMessagesEnUS } from '@kobato/shared/i18n/messages/ui/en-US.ts'
import { uiMessagesZhCN } from '@kobato/shared/i18n/messages/ui/zh-CN.ts'
import { uiMessagesZhHK } from '@kobato/shared/i18n/messages/ui/zh-HK.ts'
import { uiMessagesZhTW } from '@kobato/shared/i18n/messages/ui/zh-TW.ts'
import { createIntl, createIntlCache } from 'react-intl'

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

const intlCache = createIntlCache()
const translators = new Map<AppLocale, I18nValue['t']>()

/** Real ICU translator for component/unit tests (plural and select included). */
export function makeTranslator(locale: AppLocale = 'zh-CN'): I18nValue['t'] {
  const cached = translators.get(locale)
  if (cached !== undefined) {
    return cached
  }
  const intl = createIntl({ locale, messages: MESSAGES[locale], onError: () => {} }, intlCache)
  const t: I18nValue['t'] = (id, params) => intl.formatMessage({ id }, params) as unknown as string
  translators.set(locale, t)
  return t
}

export const tZhCN = makeTranslator('zh-CN')
