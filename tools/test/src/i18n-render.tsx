import type { AppLocale } from '@kobato/i18n/locales.ts'
import type { UiMessages } from '@kobato/i18n/messages/ui/en-US.ts'
import type { ReactElement, ReactNode } from 'react'

import { uiMessagesEnUS } from '@kobato/i18n/messages/ui/en-US.ts'
import { uiMessagesZhCN } from '@kobato/i18n/messages/ui/zh-CN.ts'
import { uiMessagesZhHK } from '@kobato/i18n/messages/ui/zh-HK.ts'
import { uiMessagesZhTW } from '@kobato/i18n/messages/ui/zh-TW.ts'
import { I18nProvider } from '@kobato/ui/lib/I18nProvider.tsx'
import { render, renderHook, type RenderHookOptions, type RenderHookResult } from '@testing-library/react'

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

export interface RenderHookWithI18nOptions<Props> extends Omit<RenderHookOptions<Props>, 'wrapper'> {
  locale?: AppLocale
}

export function renderHookWithI18n<Result, Props>(
  callback: (initialProps: Props) => Result,
  options: RenderHookWithI18nOptions<Props> = {},
): RenderHookResult<Result, Props> {
  const { locale, ...rest } = options
  return renderHook(callback, {
    ...rest,
    wrapper: ({ children }: { children: ReactNode }) => wrapWithI18n(children, { locale }),
  })
}
