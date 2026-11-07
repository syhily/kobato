import type { ReactElement, ReactNode } from 'react'

import { render } from '@testing-library/react'

import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessages } from '@/shared/i18n/messages/ui/en-US'

import { uiMessagesEnUS } from '@/shared/i18n/messages/ui/en-US'
import { uiMessagesZhCN } from '@/shared/i18n/messages/ui/zh-CN'
import { uiMessagesZhHK } from '@/shared/i18n/messages/ui/zh-HK'
import { uiMessagesZhTW } from '@/shared/i18n/messages/ui/zh-TW'
import { I18nProvider } from '@/ui/lib/I18nProvider'

const CATALOGS = {
  'en-US': uiMessagesEnUS,
  'zh-CN': uiMessagesZhCN,
  'zh-HK': uiMessagesZhHK,
  'zh-TW': uiMessagesZhTW,
} as const satisfies Record<AppLocale, UiMessages>

export interface I18nTestOptions {
  locale?: AppLocale
  messages?: UiMessages
}

/** Wrap client components that call `useI18n()` for RTL/SSR tests. */
export function wrapWithI18n(node: ReactNode, options: I18nTestOptions = {}): ReactElement {
  const locale = options.locale ?? 'zh-CN'
  return (
    <I18nProvider locale={locale} messages={options.messages ?? CATALOGS[locale]}>
      {node}
    </I18nProvider>
  )
}

export function renderWithI18n(ui: ReactElement, options: I18nTestOptions = {}) {
  return render(wrapWithI18n(ui, options))
}
